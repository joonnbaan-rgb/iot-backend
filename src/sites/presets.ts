/** แม่แบบอุปกรณ์ตามรูปแบบการใช้งาน (ใช้เติมฟอร์มเพิ่มอุปกรณ์ในแอป/เว็บ) */
export interface DevicePreset {
  key: string;
  label: string;
  type: 'sensor' | 'camera' | 'actuator';
  metrics?: string[];
}

export const SITE_PRESETS: Record<'home' | 'farm' | 'factory', { label: string; devices: DevicePreset[] }> = {
  home: {
    label: 'Smart Home',
    devices: [
      { key: 'room_temp', label: 'อุณหภูมิ/ความชื้นห้อง', type: 'sensor', metrics: ['temperature', 'humidity'] },
      { key: 'light', label: 'ไฟ/สวิตช์', type: 'actuator' },
      { key: 'ip_cam', label: 'กล้อง IP', type: 'camera' },
    ],
  },
  farm: {
    label: 'IoT Farm',
    devices: [
      { key: 'soil', label: 'ความชื้นดิน', type: 'sensor', metrics: ['soil_moisture', 'temperature'] },
      { key: 'weather', label: 'สภาพอากาศ', type: 'sensor', metrics: ['temperature', 'humidity', 'light'] },
      { key: 'water_tank', label: 'ระดับน้ำในถัง', type: 'sensor', metrics: ['water_level'] },
      { key: 'pump', label: 'ปั๊มน้ำ/วาล์ว', type: 'actuator' },
      { key: 'farm_cam', label: 'กล้องฟาร์ม', type: 'camera' },
    ],
  },
  factory: {
    label: 'Factory',
    devices: [
      { key: 'machine_temp', label: 'อุณหภูมิเครื่องจักร', type: 'sensor', metrics: ['temperature'] },
      { key: 'vibration', label: 'การสั่นสะเทือน', type: 'sensor', metrics: ['vibration'] },
      { key: 'power', label: 'มิเตอร์ไฟฟ้า', type: 'sensor', metrics: ['power', 'current', 'voltage'] },
      { key: 'motor', label: 'มอเตอร์/คอนแทกเตอร์', type: 'actuator' },
      { key: 'line_cam', label: 'กล้องไลน์ผลิต', type: 'camera' },
    ],
  },
};
