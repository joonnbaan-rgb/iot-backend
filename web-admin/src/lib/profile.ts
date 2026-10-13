import type { DeviceProfile, MqttCredentials } from './types';

/** แทน {{ตัวแปร}} ด้วยค่า; ตัวแปรที่ยังไม่มีค่าคงรูป <ชื่อ> ให้ผู้ใช้เห็นว่าต้องกรอก */
export function renderTemplate(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => (vars[k] !== undefined && vars[k] !== '' ? (vars[k] as string) : `<${k}>`));
}

export function fieldDefaults(p: DeviceProfile): Record<string, string> {
  return Object.fromEntries(p.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default as string]));
}

/** ตัวแปรระบบของอุปกรณ์ (MQTT) ถ้าเพิ่งออกรหัสจะเติม host/port/password ให้ด้วย */
export function systemVars(deviceId: string | undefined, creds: MqttCredentials | null): Record<string, string | undefined> {
  const id = deviceId;
  return {
    device_id: id,
    telemetry_topic: id ? `devices/${id}/telemetry` : undefined,
    command_topic: id ? `devices/${id}/command` : undefined,
    ack_topic: id ? `devices/${id}/ack` : undefined,
    mqtt_user: id,
    mqtt_host: creds?.host,
    mqtt_port: creds ? String(creds.port) : undefined,
    mqtt_password: creds?.password,
  };
}
