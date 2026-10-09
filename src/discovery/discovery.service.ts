import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import * as http from 'http';
import { Device } from '../devices/entities/device.entity';

export type DiscoveredKind = 'tasmota' | 'sonoff_diy' | 'ip_camera';

export interface DiscoveredDevice {
  ip: string;
  kind: DiscoveredKind;
  name: string;
  detail: string;
  suggested_type: 'actuator' | 'camera';
  suggested_rtsp_url?: string;
  already_added: boolean;
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}
function intToIp(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

function isPrivate(ip: string): boolean {
  const n = ipToInt(ip);
  return (
    (n >>> 24 === 10) ||
    (n >>> 20 === 0xac1) || // 172.16/12
    (n >>> 16 === 0xc0a8) // 192.168/16
  );
}

/** ค้นหาอุปกรณ์ในวง LAN โดยลองเชื่อมต่อพอร์ตที่รู้จัก (Tasmota 80, Sonoff DIY 8081, RTSP 554) */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private scanning = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
  ) {}

  private hostsOf(subnet: string): string[] {
    const [base, prefixStr] = subnet.split('/');
    const prefix = Number(prefixStr);
    const octets = base.split('.').map(Number);
    if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
      throw new BadRequestException('subnet ไม่ถูกต้อง');
    }
    if (!isPrivate(base)) throw new BadRequestException('สแกนได้เฉพาะเครือข่ายภายใน (192.168.x.x, 10.x.x.x, 172.16-31.x.x)');
    if (!(prefix >= 22 && prefix <= 30)) throw new BadRequestException('ขนาดเครือข่ายต้องอยู่ระหว่าง /22 ถึง /30');
    const mask = (~0 << (32 - prefix)) >>> 0;
    const network = (ipToInt(base) & mask) >>> 0;
    const broadcast = (network | ~mask) >>> 0;
    const out: string[] = [];
    for (let n = network + 1; n < broadcast; n++) out.push(intToIp(n));
    return out;
  }

  private tcpOpen(host: string, port: number, timeoutMs = 700): Promise<boolean> {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      const done = (ok: boolean) => {
        sock.destroy();
        resolve(ok);
      };
      sock.setTimeout(timeoutMs);
      sock.on('connect', () => done(true));
      sock.on('timeout', () => done(false));
      sock.on('error', () => done(false));
      sock.connect(port, host);
    });
  }

  /** เรียก HTTP ด้วยโมดูล http ของ Node (จัดการ error/timeout เองทุกจุด ไม่พึ่ง fetch) แล้วแปลงผลเป็น JSON */
  private httpJson(
    host: string,
    port: number,
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: string,
    timeoutMs = 2000,
  ): Promise<any | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v: any | null) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      try {
        const req = http.request(
          {
            host,
            port,
            path,
            method,
            timeout: timeoutMs,
            headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {},
          },
          (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              return finish(null);
            }
            const chunks: Buffer[] = [];
            let size = 0;
            res.on('data', (c: Buffer) => {
              size += c.length;
              if (size > 64 * 1024) {
                req.destroy(); // หน้าเว็บใหญ่เกินไป ไม่ใช่ API ของอุปกรณ์
                return finish(null);
              }
              chunks.push(c);
            });
            res.on('end', () => {
              try {
                finish(JSON.parse(Buffer.concat(chunks).toString('utf8')));
              } catch {
                finish(null);
              }
            });
            res.on('error', () => finish(null));
            res.on('aborted', () => finish(null));
          },
        );
        req.on('timeout', () => {
          req.destroy();
          finish(null);
        });
        req.on('error', () => finish(null));
        if (body) req.write(body);
        req.end();
      } catch {
        finish(null);
      }
    });
  }

  private rtspProbe(host: string, timeoutMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      let buf = '';
      const done = (ok: boolean) => {
        sock.destroy();
        resolve(ok);
      };
      sock.setTimeout(timeoutMs);
      sock.on('timeout', () => done(false));
      sock.on('error', () => done(false));
      sock.on('data', (d) => {
        buf += d.toString('latin1');
        if (buf.includes('RTSP/')) done(true);
      });
      sock.connect(554, host, () => {
        sock.write(`OPTIONS rtsp://${host}:554/ RTSP/1.0\r\nCSeq: 1\r\n\r\n`);
      });
    });
  }

  private async probeHost(ip: string): Promise<DiscoveredDevice[]> {
    const found: DiscoveredDevice[] = [];
    const [p80, p8081, p554] = await Promise.all([
      this.tcpOpen(ip, 80),
      this.tcpOpen(ip, 8081),
      this.tcpOpen(ip, 554),
    ]);

    if (p80) {
      const j = await this.httpJson(ip, 80, '/cm?cmnd=Status%200');
      if (j && (j.Status || j.StatusNET)) {
        const names: string[] = j.Status?.FriendlyName ?? [];
        const name = j.Status?.DeviceName || names[0] || `Tasmota ${ip}`;
        const fw = j.StatusFWR?.Version ? `FW ${j.StatusFWR.Version}` : '';
        const mac = j.StatusNET?.Mac ?? '';
        found.push({
          ip,
          kind: 'tasmota',
          name,
          detail: ['Tasmota', fw, mac].filter(Boolean).join(' · '),
          suggested_type: 'actuator',
          already_added: false,
        });
      }
    }

    if (p8081) {
      const j = await this.httpJson(ip, 8081, '/zeroconf/info', 'POST', JSON.stringify({ deviceid: '', data: {} }));
      if (j && j.data) {
        const id: string = j.data.deviceid ?? '';
        found.push({
          ip,
          kind: 'sonoff_diy',
          name: id ? `Sonoff ${id}` : `Sonoff ${ip}`,
          detail: ['Sonoff DIY mode', j.data.type, j.data.switch ? `สวิตช์: ${j.data.switch}` : '']
            .filter(Boolean)
            .join(' · '),
          suggested_type: 'actuator',
          already_added: false,
        });
      }
    }

    if (p554 && (await this.rtspProbe(ip))) {
      found.push({
        ip,
        kind: 'ip_camera',
        name: `กล้อง ${ip}`,
        detail: 'ตอบรับ RTSP (พอร์ต 554) · อาจต้องเติม user:password และ path ของกล้อง',
        suggested_type: 'camera',
        suggested_rtsp_url: `rtsp://${ip}:554/`,
        already_added: false,
      });
    }
    return found;
  }

  async scan(userId: string, subnetInput?: string): Promise<{ subnet: string; devices: DiscoveredDevice[] }> {
    const subnet = subnetInput ?? this.config.get<string>('DISCOVERY_SUBNET', '192.168.1.0/24');
    const hosts = this.hostsOf(subnet);
    if (this.scanning) throw new BadRequestException('กำลังสแกนอยู่ รอสักครู่แล้วลองใหม่');
    this.scanning = true;
    const started = Date.now();
    try {
      const results: DiscoveredDevice[] = [];
      const queue = [...hosts];
      const worker = async () => {
        while (queue.length) {
          const ip = queue.shift()!;
          try {
            results.push(...(await this.probeHost(ip)));
          } catch (err) {
            this.logger.warn(`ตรวจ ${ip} ไม่สำเร็จ: ${(err as Error).message}`);
          }
        }
      };
      await Promise.all(Array.from({ length: 64 }, worker));

      const mine = await this.devices.find({ where: { owner_id: userId } });
      for (const r of results) {
        r.already_added = mine.some(
          (d) => d.connection?.host === r.ip || (!!d.rtsp_url && d.rtsp_url.includes(`//${r.ip}`)) ||
            (!!d.rtsp_url && d.rtsp_url.includes(`@${r.ip}`)),
        );
      }
      results.sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip));
      this.logger.log(`สแกน ${subnet}: ${hosts.length} เครื่อง พบ ${results.length} รายการ (${Date.now() - started}ms)`);
      return { subnet, devices: results };
    } finally {
      this.scanning = false;
    }
  }
}
