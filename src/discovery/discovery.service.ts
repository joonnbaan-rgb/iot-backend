import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
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
    const network = ipToInt(base) & mask;
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

  private async httpJson(url: string, init?: RequestInit, timeoutMs = 2000): Promise<any | null> {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
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
      const j = await this.httpJson(`http://${ip}/cm?cmnd=Status%200`);
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
      const j = await this.httpJson(`http://${ip}:8081/zeroconf/info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceid: '', data: {} }),
      });
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
          results.push(...(await this.probeHost(ip)));
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
