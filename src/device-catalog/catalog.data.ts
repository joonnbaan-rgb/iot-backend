import { DeviceProfile, ProfileField } from './entities/device-profile.entity';

/**
 * แคตตาล็อกอุปกรณ์ที่มากับระบบ (builtin) — seed/อัปเดตทุกครั้งที่ backend เริ่มทำงาน (คงสถานะ enabled ที่ admin ตั้งไว้)
 * ต้องการปรับแก้: คัดลอกเป็นโปรไฟล์ custom ผ่าน API (POST /device-profiles) แทนการแก้แถว builtin
 *
 * ข้อมูล RTSP path อ้างอิงจากตารางสาธารณะ (เช่น smartrtsp.com) — รุ่น/เฟิร์มแวร์ต่างกันอาจใช้ path ไม่เหมือนกัน
 * ต้องทดสอบกับกล้องจริงเสมอ; สคริปต์/กฎของเฟิร์มแวร์เป็นตัวอย่างเริ่มต้น ตรวจกับเอกสารผู้ผลิตก่อนใช้งานจริง
 */
export type CatalogEntry = Omit<DeviceProfile, 'created_at' | 'updated_at' | 'source' | 'enabled'>;

const DOC_SMARTRTSP = { title: 'ตาราง RTSP URL ของกล้องยี่ห้อต่างๆ', url: 'https://www.smartrtsp.com/guides/rtsp-url-list' };

// ---------- กล้อง RTSP ----------
const camFields = (opts: { port?: string; channel?: string; channelLabel?: string; user?: string } = {}): ProfileField[] => [
  { key: 'ip', label: 'IP กล้อง', placeholder: '192.168.1.64' },
  { key: 'port', label: 'พอร์ต RTSP', default: opts.port ?? '554' },
  { key: 'username', label: 'ชื่อผู้ใช้', default: opts.user ?? 'admin' },
  { key: 'password', label: 'รหัสผ่านกล้อง', secret: true },
  ...(opts.channel ? [{ key: 'channel', label: opts.channelLabel ?? 'ช่อง (channel)', default: opts.channel }] : []),
];

const cam = (
  id: string,
  vendor: string,
  model: string,
  description: string,
  rtsp: { label: string; path: string }[],
  extra: { fields?: ProfileField[]; steps?: string[]; notes?: string; tags?: string[] } = {},
): CatalogEntry => ({
  id,
  vendor,
  model,
  device_type: 'camera',
  protocol: 'rtsp',
  integration: 'rtsp',
  description,
  default_name: `กล้อง ${vendor}`,
  default_unit: null,
  fields: extra.fields ?? camFields(),
  rtsp_templates: rtsp.map((r) => ({ label: r.label, url: `rtsp://{{username}}:{{password}}@{{ip}}:{{port}}${r.path}` })),
  steps: extra.steps ?? [
    'ตั้งค่ากล้องให้ได้ IP คงที่ในวง LAN เดียวกับเครื่องที่รัน backend (หรือเปิดพอร์ต RTSP ผ่าน VPN/ไฟร์วอลล์ที่ปลอดภัย)',
    'เปิดใช้งาน RTSP (และสร้างบัญชีผู้ใช้สำหรับดูภาพ) ในหน้าตั้งค่าของกล้อง ถ้ารุ่นนั้นปิดไว้เป็นค่าเริ่มต้น',
    'กรอก IP / ชื่อผู้ใช้ / รหัสผ่าน ด้านบน แล้วเลือกสตรีมหลักหรือสตรีมรอง (สตรีมรองเบากว่า เหมาะกับดูผ่านมือถือ)',
    'ทดสอบ URL ด้วย VLC (Media → Open Network Stream) ก่อน ถ้าเปิดได้ จึงใส่ในระบบ',
  ],
  snippets: [],
  links: [DOC_SMARTRTSP],
  notes: extra.notes ?? '',
  tags: ['camera', 'rtsp', vendor.toLowerCase(), ...(extra.tags ?? [])],
});

const CAMERAS: CatalogEntry[] = [
  cam('hikvision-camera', 'Hikvision', 'กล้อง IP / NVR (ซีรีส์ DS-2CD ฯลฯ)', 'กล้องและ NVR ของ Hikvision (ช่อง 1: หลัก 101 / รอง 102)', [
    { label: 'สตรีมหลัก (main)', path: '/Streaming/Channels/{{channel}}01' },
    { label: 'สตรีมรอง (sub)', path: '/Streaming/Channels/{{channel}}02' },
  ], { fields: camFields({ channel: '1', channelLabel: 'ช่อง (1, 2, …)' }), notes: 'NVR ใช้ช่อง 1..N ตามหมายเลขกล้องที่ต่อ' }),
  cam('dahua-camera', 'Dahua', 'กล้อง IP / NVR / XVR', 'กล้องและเครื่องบันทึกของ Dahua (ใช้ path เดียวกับ Amcrest)', [
    { label: 'สตรีมหลัก (subtype=0)', path: '/cam/realmonitor?channel={{channel}}&subtype=0' },
    { label: 'สตรีมรอง (subtype=1)', path: '/cam/realmonitor?channel={{channel}}&subtype=1' },
  ], { fields: camFields({ channel: '1' }) }),
  cam('amcrest-camera', 'Amcrest', 'กล้อง IP (IP2M, IP4M ฯลฯ)', 'Amcrest ใช้เฟิร์มแวร์ตระกูลเดียวกับ Dahua', [
    { label: 'สตรีมหลัก', path: '/cam/realmonitor?channel={{channel}}&subtype=0' },
    { label: 'สตรีมรอง', path: '/cam/realmonitor?channel={{channel}}&subtype=1' },
  ], { fields: camFields({ channel: '1' }) }),
  cam('reolink-camera', 'Reolink', 'กล้อง IP (RLC-xxx, E1 ฯลฯ)', 'Reolink ต้องเปิด RTSP/ONVIF ในตั้งค่าเครือข่าย → ขั้นสูง → Server Settings (บางรุ่นไม่รองรับ)', [
    { label: 'สตรีมหลัก', path: '/Preview_{{channel}}_main' },
    { label: 'สตรีมรอง', path: '/Preview_{{channel}}_sub' },
  ], { fields: camFields({ channel: '01', channelLabel: 'ช่อง 2 หลัก (01, 02, …)' }), tags: ['onvif'] }),
  cam('tapo-camera', 'TP-Link Tapo', 'กล้อง Tapo (C100, C200, C210 ฯลฯ)', 'สร้าง "บัญชีกล้อง" ในแอป Tapo (Advanced Settings → Camera Account) แล้วใช้บัญชีนั้นกับ RTSP — ไม่ใช่บัญชี TP-Link ID', [
    { label: 'สตรีมหลัก (stream1)', path: '/stream1' },
    { label: 'สตรีมรอง (stream2)', path: '/stream2' },
  ], { fields: camFields({ user: 'camera-account' }), tags: ['onvif'] }),
  cam('axis-camera', 'Axis', 'กล้อง Axis (ซีรีส์ M, P, Q)', 'Axis ใช้ path เดียว เลือกโค้ดเดกด้วย query ได้', [
    { label: 'ค่าเริ่มต้น', path: '/axis-media/media.amp' },
    { label: 'บังคับ H.264', path: '/axis-media/media.amp?videocodec=h264' },
  ], { fields: camFields({ user: 'root' }), tags: ['onvif'] }),
  cam('foscam-camera', 'Foscam', 'กล้อง Foscam', 'รุ่นใหม่ใช้ videoMain/videoSub รุ่นเก่าใช้ /11 และ /12', [
    { label: 'สตรีมหลัก (รุ่นใหม่)', path: '/videoMain' },
    { label: 'สตรีมรอง (รุ่นใหม่)', path: '/videoSub' },
    { label: 'สตรีมหลัก (รุ่นเก่า)', path: '/11' },
    { label: 'สตรีมรอง (รุ่นเก่า)', path: '/12' },
  ]),
  cam('uniview-camera', 'Uniview (UNV)', 'กล้อง IP / NVR', 'Uniview ใช้ c1 = ช่อง 1, s0 = สตรีมหลัก, s1 = สตรีมรอง', [
    { label: 'สตรีมหลัก', path: '/unicast/c{{channel}}/s0/live' },
    { label: 'สตรีมรอง', path: '/unicast/c{{channel}}/s1/live' },
  ], { fields: camFields({ channel: '1' }) }),
  cam('vivotek-camera', 'Vivotek', 'กล้อง IP', 'บางรุ่นใช้ live2.sdp เป็นสตรีมรอง', [
    { label: 'สตรีมหลัก', path: '/live.sdp' },
    { label: 'สตรีมรอง (บางรุ่น)', path: '/live2.sdp' },
  ]),
  cam('hanwha-camera', 'Hanwha (Samsung Wisenet)', 'กล้อง IP', 'NVR ของ Hanwha อาจใช้ path /LiveChannel/0/media.smp และพอร์ตอื่น', [
    { label: 'โปรไฟล์ 1', path: '/profile1/media.smp' },
    { label: 'โปรไฟล์ 2', path: '/profile2/media.smp' },
  ]),
  cam('wyze-camera', 'Wyze', 'Wyze Cam (เฟิร์มแวร์ RTSP)', 'ต้องลงเฟิร์มแวร์ RTSP ของ Wyze ก่อน และไม่ใช่ทุกรุ่นรองรับ', [{ label: 'สตรีมหลัก', path: '/live' }], {
    notes: 'ตั้งชื่อผู้ใช้/รหัสผ่านตอนเปิดใช้ RTSP ในแอป Wyze (Advanced Settings → RTSP)',
  }),
  cam('esp32cam-rtsp', 'Espressif', 'ESP32-CAM (เฟิร์มแวร์ RTSP)', 'ESP32-CAM แบบมาตรฐานส่ง MJPEG ผ่าน HTTP ไม่ใช่ RTSP — ต้องแฟลชเฟิร์มแวร์ที่รองรับ RTSP (เช่น โปรเจกต์ Micro-RTSP / esp32cam-rtsp)', [
    { label: 'MJPEG over RTSP', path: '/mjpeg/1' },
  ], {
    fields: [{ key: 'ip', label: 'IP ของ ESP32-CAM', placeholder: '192.168.1.80' }, { key: 'port', label: 'พอร์ต RTSP', default: '554' }, { key: 'username', label: 'ผู้ใช้ (ถ้าเฟิร์มแวร์ไม่มี ใส่อะไรก็ได้)', default: 'cam' }, { key: 'password', label: 'รหัสผ่าน (ถ้าไม่มี ใส่อะไรก็ได้)', secret: true }],
    notes: 'พอร์ตและ path ขึ้นกับเฟิร์มแวร์ที่ใช้ — ตรวจในเอกสารของเฟิร์มแวร์ ภาพ MJPEG ใช้แบนด์วิดท์สูงกว่า H.264',
    tags: ['esp32', 'diy'],
  }),
  cam('onvif-generic', 'ทั่วไป', 'กล้อง ONVIF / OEM ไม่ทราบยี่ห้อ', 'ลองสแกนหาด้วย "ค้นหาอุปกรณ์" ในระบบ (ONVIF) หรือไล่ลอง path ที่พบบ่อยด้านล่าง', [
    { label: 'ลอง: /stream1', path: '/stream1' },
    { label: 'ลอง: /live', path: '/live' },
    { label: 'ลอง: /live0', path: '/live0' },
    { label: 'ลอง: Dahua-style', path: '/cam/realmonitor?channel=1&subtype=0' },
  ], { notes: 'ดูคู่มือกล้อง หรือใช้ ONVIF Device Manager หา stream URI ที่แน่นอน', tags: ['onvif'] }),
];

// ---------- โค้ดตัวอย่างสำหรับ ESP32/ESP8266 (Arduino) ----------
const SENSOR_FIELDS = (pin: string, unit: string): ProfileField[] => [
  { key: 'pin', label: 'ขา GPIO ที่ต่อเซนเซอร์', default: pin },
  { key: 'unit', label: 'หน่วยที่ส่ง', default: unit },
];

const arduinoSketch = (o: { includes: string; globals: string; setup: string; read: string; actuator?: boolean }) => String.raw`#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
${o.actuator ? '#include <ArduinoJson.h>\n' : ''}${o.includes}
// ---- ตั้งค่า (แก้ WiFi ให้ตรงกับเครือข่ายของคุณ) ----
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* MQTT_HOST = "{{mqtt_host}}";
const int   MQTT_PORT = {{mqtt_port}};          // 8883 = TLS, 1883 = ไม่เข้ารหัส (ใช้ในวง LAN ตอนทดสอบเท่านั้น)
const char* DEVICE_ID = "{{device_id}}";        // ใช้เป็นทั้ง clientId และ username
const char* MQTT_USER = "{{mqtt_user}}";
const char* MQTT_PASS = "{{mqtt_password}}";
const char* TOPIC_TELEMETRY = "{{telemetry_topic}}";
const char* TOPIC_COMMAND   = "{{command_topic}}";
const char* TOPIC_ACK       = "{{ack_topic}}";
const char* UNIT = "{{unit}}";
${o.globals}
WiFiClient plainClient;
WiFiClientSecure tlsClient;
PubSubClient mqtt;
unsigned long lastSend = 0;
${o.actuator ? String.raw`
void onMessage(char* topic, byte* payload, unsigned int len) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload, len)) return;
  const char* action = doc["action"];
  const char* cid = doc["command_id"];
  if (!action || !cid) return;
  bool ok = true;
  if (!strcmp(action, "turn_on")) digitalWrite(RELAY_PIN, RELAY_ON);
  else if (!strcmp(action, "turn_off")) digitalWrite(RELAY_PIN, !RELAY_ON);
  else ok = false;
  char buf[160];
  snprintf(buf, sizeof(buf), "{\"command_id\":\"%s\",\"status\":\"%s\"}", cid, ok ? "success" : "failed");
  mqtt.publish(TOPIC_ACK, buf);
  Serial.printf("command %s -> %s\n", action, ok ? "ok" : "unknown");
}
` : ''}
void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi connected");
}

void connectMqtt() {
  while (!mqtt.connected()) {
    if (mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASS)) {
      ${o.actuator ? 'mqtt.subscribe(TOPIC_COMMAND);' : '// อุปกรณ์นี้ส่งข้อมูลอย่างเดียว ไม่ต้อง subscribe'}
    } else {
      Serial.printf("MQTT failed rc=%d, retry in 5s\n", mqtt.state());
      delay(5000);
    }
  }
}

void publishValue(float v) {
  if (isnan(v)) return;
  char buf[96];
  snprintf(buf, sizeof(buf), "{\"value\":%.2f,\"unit\":\"%s\"}", v, UNIT);
  mqtt.publish(TOPIC_TELEMETRY, buf);
  Serial.println(buf);
}

void setup() {
  Serial.begin(115200);
${o.setup}
  connectWifi();
  if (MQTT_PORT == 8883) {
    tlsClient.setInsecure();   // ทดสอบเท่านั้น: ใช้งานจริงควร tlsClient.setCACert(...) ของ broker
    mqtt.setClient(tlsClient);
  } else {
    mqtt.setClient(plainClient);
  }
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  ${o.actuator ? 'mqtt.setCallback(onMessage);' : ''}
}

float readValue() {
${o.read}
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();
  if (millis() - lastSend > 10000) {      // ส่งทุก 10 วินาที
    lastSend = millis();
    ${o.actuator ? '// ส่งสถานะเป็นตัวเลข: 1 = เปิด, 0 = ปิด\n    publishValue(digitalRead(RELAY_PIN) == RELAY_ON ? 1 : 0);' : 'publishValue(readValue());'}
  }
}
`;

const MQTT_STEPS = (extra: string[] = []) => [
  'เพิ่มอุปกรณ์ในระบบก่อน (ชนิดตามโปรไฟล์นี้) แล้วเปิดหน้าอุปกรณ์ → "ออกรหัสเชื่อมต่อ MQTT" เพื่อให้ได้ username/password (แสดงครั้งเดียว)',
  ...extra,
  'ตั้ง host / port / รหัสผ่าน ตามที่ระบบออกให้ (ตัวอย่างโค้ดด้านล่างเติมค่าให้อัตโนมัติเมื่อมีรหัสแล้ว)',
  'เปิด Serial Monitor (115200) ดูว่าเชื่อมต่อ MQTT ได้ แล้วกลับมาดูหน้าอุปกรณ์ว่าสถานะเป็น online และมีค่าขึ้น',
];
const ARDUINO_LIBS = 'ติดตั้งไลบรารีใน Arduino IDE: PubSubClient (Nick O\'Leary)';

const mqttSensor = (
  id: string,
  vendor: string,
  model: string,
  description: string,
  unit: string,
  pin: string,
  code: { includes: string; globals: string; setup: string; read: string },
  libs: string,
  tags: string[] = [],
): CatalogEntry => ({
  id,
  vendor,
  model,
  device_type: 'sensor',
  protocol: 'mqtt',
  integration: 'direct',
  description,
  default_name: model,
  default_unit: unit,
  fields: SENSOR_FIELDS(pin, unit),
  rtsp_templates: [],
  steps: MQTT_STEPS([`${ARDUINO_LIBS}${libs ? ' และ ' + libs : ''}`, 'บอร์ด ESP32 (ESP8266 ใช้ได้โดยเปลี่ยน #include <WiFi.h> เป็น <ESP8266WiFi.h> และตัดส่วน WiFiClientSecure ถ้าไม่ใช้ TLS)']),
  snippets: [{ title: 'สเก็ตช์ Arduino (ESP32)', language: 'cpp', code: arduinoSketch(code) }],
  links: [{ title: 'PubSubClient', url: 'https://pubsubclient.knolleary.net/' }],
  notes: 'ระบบรับค่าเป็นตัวเลขตัวเดียวต่อหนึ่งอุปกรณ์ (value + unit) — เซนเซอร์ที่วัดหลายค่าให้สร้างเป็นหลายอุปกรณ์ แยกรหัส MQTT',
  tags: ['esp32', 'arduino', 'mqtt', ...tags],
});

const MQTT_DEVICES: CatalogEntry[] = [
  mqttSensor('esp32-dht22-temp', 'Espressif', 'ESP32 + DHT22 (อุณหภูมิ)', 'เซนเซอร์อุณหภูมิ/ความชื้น DHT22 (AM2302) ต่อกับ ESP32 — ตัวอย่างส่งอุณหภูมิ °C', '°C', '4', {
    includes: '#include <DHT.h>',
    globals: '#define DHT_PIN {{pin}}\nDHT dht(DHT_PIN, DHT22);',
    setup: '  dht.begin();',
    read: '  return dht.readTemperature();   // ความชื้น: dht.readHumidity() (สร้างเป็นอุปกรณ์แยก)',
  }, 'DHT sensor library (Adafruit)', ['dht22', 'temperature']),
  mqttSensor('esp32-dht22-humidity', 'Espressif', 'ESP32 + DHT22 (ความชื้น)', 'DHT22 ส่งค่าความชื้นสัมพัทธ์ %', '%', '4', {
    includes: '#include <DHT.h>',
    globals: '#define DHT_PIN {{pin}}\nDHT dht(DHT_PIN, DHT22);',
    setup: '  dht.begin();',
    read: '  return dht.readHumidity();',
  }, 'DHT sensor library (Adafruit)', ['dht22', 'humidity']),
  mqttSensor('esp32-ds18b20', 'Espressif', 'ESP32 + DS18B20 (อุณหภูมิกันน้ำ)', 'โพรบอุณหภูมิ DS18B20 (1-Wire) ต้องมีตัวต้านทาน pull-up 4.7kΩ ที่ขา data', '°C', '4', {
    includes: '#include <OneWire.h>\n#include <DallasTemperature.h>',
    globals: '#define ONE_WIRE_PIN {{pin}}\nOneWire oneWire(ONE_WIRE_PIN);\nDallasTemperature ds(&oneWire);',
    setup: '  ds.begin();',
    read: '  ds.requestTemperatures();\n  float t = ds.getTempCByIndex(0);\n  return (t == DEVICE_DISCONNECTED_C) ? NAN : t;',
  }, 'OneWire และ DallasTemperature', ['ds18b20', 'temperature']),
  mqttSensor('esp32-bme280-temp', 'Espressif', 'ESP32 + BME280 (อุณหภูมิ)', 'BME280 ต่อ I2C (SDA=21, SCL=22 บน ESP32 ส่วนใหญ่) ที่อยู่ 0x76 หรือ 0x77', '°C', '21', {
    includes: '#include <Wire.h>\n#include <Adafruit_BME280.h>',
    globals: 'Adafruit_BME280 bme;',
    setup: '  Wire.begin();\n  if (!bme.begin(0x76)) { Serial.println("BME280 not found (ลอง 0x77)"); }',
    read: '  return bme.readTemperature();   // ความดัน: bme.readPressure()/100.0F, ความชื้น: bme.readHumidity()',
  }, 'Adafruit BME280 Library และ Adafruit Unified Sensor', ['bme280', 'i2c', 'temperature']),
  mqttSensor('esp32-bh1750-lux', 'Espressif', 'ESP32 + BH1750 (ความสว่าง)', 'เซนเซอร์แสง BH1750 ต่อ I2C ส่งค่าเป็นลักซ์', 'lx', '21', {
    includes: '#include <Wire.h>\n#include <BH1750.h>',
    globals: 'BH1750 lightMeter;',
    setup: '  Wire.begin();\n  lightMeter.begin();',
    read: '  return lightMeter.readLightLevel();',
  }, 'BH1750 (Christopher Laws)', ['bh1750', 'i2c', 'light']),
  mqttSensor('esp32-soil-moisture', 'Espressif', 'ESP32 + เซนเซอร์ความชื้นดิน (analog)', 'เซนเซอร์ความชื้นดินแบบ capacitive ต่อขา ADC — ต้องปรับ AIR_VALUE/WATER_VALUE ให้ตรงกับเซนเซอร์ของคุณ', '%', '34', {
    includes: '',
    globals: '#define SOIL_PIN {{pin}}\nconst int AIR_VALUE = 3200;    // ค่า ADC ในอากาศ (แห้งสุด) — ปรับตามจริง\nconst int WATER_VALUE = 1400;  // ค่า ADC ในน้ำ (เปียกสุด) — ปรับตามจริง',
    setup: '  pinMode(SOIL_PIN, INPUT);',
    read: '  int raw = analogRead(SOIL_PIN);\n  float pct = (float)(AIR_VALUE - raw) * 100.0f / (AIR_VALUE - WATER_VALUE);\n  return constrain(pct, 0.0f, 100.0f);',
  }, '', ['soil', 'analog', 'agriculture']),
  {
    id: 'esp32-relay',
    vendor: 'Espressif',
    model: 'ESP32 + โมดูลรีเลย์ (เปิด/ปิด)',
    device_type: 'actuator',
    protocol: 'mqtt',
    integration: 'direct',
    description: 'ควบคุมรีเลย์ด้วยคำสั่ง turn_on / turn_off จากระบบ พร้อมตอบ ack และส่งสถานะ 1/0 ทุก 10 วินาที',
    default_name: 'รีเลย์ ESP32',
    default_unit: null,
    fields: [
      { key: 'pin', label: 'ขา GPIO ที่ต่อรีเลย์', default: '26' },
      { key: 'unit', label: 'หน่วยสถานะ', default: 'state' },
    ],
    rtsp_templates: [],
    steps: MQTT_STEPS([`${ARDUINO_LIBS} และ ArduinoJson (Benoit Blanchon)`, 'โมดูลรีเลย์ส่วนใหญ่ทำงานแบบ active-LOW (สั่ง LOW = ติด) ถ้าของคุณเป็นแบบนั้น ให้เปลี่ยน RELAY_ON เป็น LOW']),
    snippets: [{
      title: 'สเก็ตช์ Arduino (ESP32)',
      language: 'cpp',
      code: arduinoSketch({
        includes: '',
        globals: '#define RELAY_PIN {{pin}}\n#define RELAY_ON HIGH   // active-LOW: เปลี่ยนเป็น LOW',
        setup: '  pinMode(RELAY_PIN, OUTPUT);\n  digitalWrite(RELAY_PIN, !RELAY_ON);   // เริ่มต้นปิด',
        read: '  return 0;',
        actuator: true,
      }),
    }],
    links: [{ title: 'ArduinoJson', url: 'https://arduinojson.org/' }],
    notes: 'ระบบส่งคำสั่ง {"command_id","action":"turn_on|turn_off"} ที่หัวข้อ command และรอ ack {"command_id","status":"success|failed"} ภายใน 10 วินาที',
    tags: ['esp32', 'relay', 'arduino', 'mqtt'],
  },
  {
    id: 'micropython-sensor',
    vendor: 'MicroPython',
    model: 'ESP32/ESP8266/Pico W (MicroPython) — เซนเซอร์ทั่วไป',
    device_type: 'sensor',
    protocol: 'mqtt',
    integration: 'direct',
    description: 'ตัวอย่าง MicroPython ด้วย umqtt.simple ส่งค่าตัวเลขตัวเดียว แก้ฟังก์ชัน read_value() ให้ตรงกับเซนเซอร์',
    default_name: 'เซนเซอร์ MicroPython',
    default_unit: null,
    fields: [{ key: 'unit', label: 'หน่วยที่ส่ง', default: '°C' }],
    rtsp_templates: [],
    steps: MQTT_STEPS(['ลง MicroPython บนบอร์ด และมีโมดูล umqtt.simple (ติดตั้งด้วย mip.install("umqtt.simple") หรือมากับเฟิร์มแวร์บางรุ่น)']),
    snippets: [{
      title: 'main.py',
      language: 'python',
      code: `import network, time, json
from umqtt.simple import MQTTClient

WIFI_SSID = "YOUR_WIFI_NAME"
WIFI_PASS = "YOUR_WIFI_PASSWORD"
HOST = "{{mqtt_host}}"
PORT = {{mqtt_port}}          # 8883 = TLS (ssl=True), 1883 = ไม่เข้ารหัส
DEVICE_ID = "{{device_id}}"
USER = "{{mqtt_user}}"
PASSWORD = "{{mqtt_password}}"
TOPIC = "{{telemetry_topic}}"
UNIT = "{{unit}}"

def read_value():
    # TODO: อ่านค่าจริงจากเซนเซอร์ของคุณ (คืนค่าเป็นตัวเลข)
    return 25.0

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(WIFI_SSID, WIFI_PASS)
while not wlan.isconnected():
    time.sleep(0.5)

client = MQTTClient(DEVICE_ID, HOST, port=PORT, user=USER, password=PASSWORD, ssl=(PORT == 8883))
client.connect()
while True:
    client.publish(TOPIC, json.dumps({"value": read_value(), "unit": UNIT}))
    time.sleep(10)
`,
    }],
    links: [{ title: 'MicroPython umqtt', url: 'https://docs.micropython.org/' }],
    notes: 'บางพอร์ตของ MicroPython ต้องกำหนด ssl_params เพิ่มเมื่อใช้ TLS — ดูเอกสารของบอร์ดคุณ',
    tags: ['micropython', 'mqtt', 'pico'],
  },
  {
    id: 'tasmota-sensor',
    vendor: 'Tasmota',
    model: 'Tasmota — เซนเซอร์ (DHT22 / DS18B20 / BME280 ฯลฯ)',
    device_type: 'sensor',
    protocol: 'mqtt',
    integration: 'rule',
    description: 'เฟิร์มแวร์ Tasmota ส่งข้อมูลในรูปแบบของตัวเอง จึงใช้กฎ (Rule) แปลงค่าหนึ่งตัวไปเป็นรูปแบบของระบบ — ส่งข้อมูลได้อย่างเดียว',
    default_name: 'เซนเซอร์ Tasmota',
    default_unit: '°C',
    fields: [
      { key: 'sensor_name', label: 'ชื่อเซนเซอร์ใน Tasmota', default: 'DHT22', placeholder: 'ดูจากหน้า Console: ตัวอักษรหลัง Time ใน SENSOR' },
      { key: 'metric', label: 'ชื่อค่าที่จะส่ง', default: 'Temperature' },
      { key: 'unit', label: 'หน่วย', default: '°C' },
    ],
    rtsp_templates: [],
    steps: MQTT_STEPS([
      'ใน Tasmota: Configuration → Configure Module เลือกขาเซนเซอร์ตามรุ่น (เช่น DHT22 ที่ GPIO ที่ต่อ) แล้วรีสตาร์ท',
      'Configuration → Configure MQTT: ใส่ Host/Port/User/Password ตามที่ระบบออกให้ และ Client = {{device_id}}',
      'เปิดหน้า Console แล้วรันคำสั่งในกล่อง "คำสั่ง Console" ด้านล่างทีละบรรทัด (ปรับชื่อเซนเซอร์ตามที่เห็นในข้อความ SENSOR ของคุณ)',
    ]),
    snippets: [{
      title: 'คำสั่ง Console ของ Tasmota',
      language: 'text',
      code: `Rule1 ON Tele-{{sensor_name}}#{{metric}} DO Publish {{telemetry_topic}} {"value":%value%,"unit":"{{unit}}"} ENDON
Rule1 1
TelePeriod 30`,
    }],
    links: [{ title: 'เอกสาร Tasmota', url: 'https://tasmota.github.io/docs/' }],
    notes: 'Tasmota เชื่อมต่อ MQTT ได้ชุดเดียวต่ออุปกรณ์ — ค่าหนึ่งตัวต่อหนึ่งอุปกรณ์ในระบบ ต้องการหลายค่าต้องใช้ตัวกลางแปลง (ดูโปรไฟล์ Node-RED) ตรวจชื่อ trigger กับเวอร์ชัน Tasmota ของคุณ',
    tags: ['tasmota', 'mqtt', 'rule'],
  },
  {
    id: 'tasmota-relay',
    vendor: 'Tasmota / Sonoff',
    model: 'Sonoff Basic / Mini / POW (เฟิร์มแวร์ Tasmota)',
    device_type: 'actuator',
    protocol: 'mqtt',
    integration: 'planned',
    description: 'รีเลย์ Sonoff ที่แฟลช Tasmota — ยังรองรับไม่เต็มรูปแบบ: Tasmota ตอบรับคำสั่งผ่านหัวข้อ cmnd/…/POWER ซึ่งต่างจากรูปแบบคำสั่ง+ack ของระบบ ต้องมีตัวแปลงฝั่ง backend (แผน Phase C)',
    default_name: 'Sonoff',
    default_unit: null,
    fields: [],
    rtsp_templates: [],
    steps: [
      'ตอนนี้ใช้ได้เฉพาะการส่งสถานะ/ค่าไฟขึ้นระบบด้วยกฎ (ดูโปรไฟล์ "Tasmota — เซนเซอร์") ส่วนการสั่งเปิด/ปิดจากระบบยังไม่ทำงานเต็มรูปแบบ',
      'ทางเลือกชั่วคราว: ใช้ Shelly Gen2 หรือ ESP32 + รีเลย์ ที่รองรับคำสั่งตรง',
    ],
    snippets: [],
    links: [{ title: 'เอกสาร Tasmota', url: 'https://tasmota.github.io/docs/' }],
    notes: 'อยู่ในแผนพัฒนา (Phase C) — ยังไม่รับประกันว่าสั่งงานได้',
    tags: ['tasmota', 'sonoff', 'relay', 'planned'],
  },
  {
    id: 'shelly-gen2-relay',
    vendor: 'Shelly',
    model: 'Shelly Plus / Pro (Gen2+) — รีเลย์ / วัดกำลังไฟ',
    device_type: 'actuator',
    protocol: 'mqtt',
    integration: 'script',
    description: 'ใช้สคริปต์ในตัว Shelly (mJS) รับคำสั่ง turn_on/turn_off จากระบบ ตอบ ack และส่งกำลังไฟ (W) ทุก 30 วินาที',
    default_name: 'Shelly',
    default_unit: 'W',
    fields: [
      { key: 'switch_id', label: 'หมายเลข switch (0 = ช่องแรก)', default: '0' },
      { key: 'unit', label: 'หน่วยที่ส่ง', default: 'W' },
    ],
    rtsp_templates: [],
    steps: MQTT_STEPS([
      'เปิดหน้าเว็บของ Shelly → Settings → MQTT: เปิดใช้งาน Enable, Server = {{mqtt_host}}:{{mqtt_port}}, User = {{mqtt_user}}, Password = รหัสที่ระบบออกให้, Client ID = {{device_id}} (ถ้าใช้พอร์ต 8883 ให้เลือก TLS)',
      'ไปที่ Scripts → Create script วางสคริปต์ด้านล่าง กด Save แล้ว Start และเปิด Run on startup',
    ]),
    snippets: [{
      title: 'สคริปต์ Shelly (mJS)',
      language: 'javascript',
      code: `let ID = "{{device_id}}";
let SW = {{switch_id}};
let UNIT = "{{unit}}";

MQTT.subscribe("{{command_topic}}", function (topic, msg) {
  let c = JSON.parse(msg);
  if (!c || !c.command_id) return;
  let ok = true;
  if (c.action === "turn_on") Shelly.call("Switch.Set", { id: SW, on: true });
  else if (c.action === "turn_off") Shelly.call("Switch.Set", { id: SW, on: false });
  else ok = false;
  MQTT.publish("{{ack_topic}}", JSON.stringify({ command_id: c.command_id, status: ok ? "success" : "failed" }), 0, false);
});

Timer.set(30000, true, function () {
  Shelly.call("Switch.GetStatus", { id: SW }, function (r) {
    if (r && r.apower !== undefined) {
      MQTT.publish("{{telemetry_topic}}", JSON.stringify({ value: r.apower, unit: UNIT }), 0, false);
    }
  });
});
`,
    }],
    links: [{ title: 'Shelly Gen2+ API', url: 'https://shelly-api-docs.shelly.cloud/gen2/' }],
    notes: 'รุ่นที่ไม่มีมิเตอร์ (เช่น Plus 1) ไม่มีค่า apower — เปลี่ยนเป็นส่งสถานะ r.output (true/false → 1/0) แทน; ตรวจ API ของเฟิร์มแวร์เวอร์ชันที่ใช้',
    tags: ['shelly', 'gen2', 'relay', 'script'],
  },
  {
    id: 'shelly-gen1',
    vendor: 'Shelly',
    model: 'Shelly Gen1 (Shelly 1, 1PM, 2.5 ฯลฯ)',
    device_type: 'actuator',
    protocol: 'mqtt',
    integration: 'planned',
    description: 'Gen1 ใช้หัวข้อ shellies/<id>/relay/0 และไม่มีสคริปต์ที่แปลงเป็นรูปแบบของระบบ — ต้องมีตัวแปลงฝั่ง backend (แผน Phase C)',
    default_name: 'Shelly Gen1',
    default_unit: null,
    fields: [],
    rtsp_templates: [],
    steps: ['ยังไม่รองรับเต็มรูปแบบ — ใช้ Shelly Gen2+ หรือ ESP32 + รีเลย์ แทน'],
    snippets: [],
    links: [{ title: 'Shelly API', url: 'https://shelly-api-docs.shelly.cloud/' }],
    notes: 'อยู่ในแผนพัฒนา (Phase C)',
    tags: ['shelly', 'gen1', 'planned'],
  },
  {
    id: 'esphome-sensor',
    vendor: 'ESPHome',
    model: 'ESPHome — เซนเซอร์ (ตัวอย่าง DHT22)',
    device_type: 'sensor',
    protocol: 'mqtt',
    integration: 'direct',
    description: 'ESPHome ใช้ mqtt.publish_json ส่งค่าไปยังหัวข้อของระบบ (ปิด discovery ของ Home Assistant)',
    default_name: 'เซนเซอร์ ESPHome',
    default_unit: '°C',
    fields: [{ key: 'pin', label: 'ขา GPIO', default: 'GPIO4' }, { key: 'unit', label: 'หน่วย', default: '°C' }],
    rtsp_templates: [],
    steps: MQTT_STEPS(['สร้างโปรเจกต์ใน ESPHome และเพิ่ม YAML ด้านล่าง (ปรับ platform/pin ตามเซนเซอร์ของคุณ)', 'พอร์ต 8883 (TLS) ต้องกำหนด certificate_authority ในส่วน mqtt: ตามเอกสาร ESPHome; ตอนทดสอบในวง LAN ใช้ 1883']),
    snippets: [{
      title: 'ESPHome YAML',
      language: 'yaml',
      code: `mqtt:
  broker: {{mqtt_host}}
  port: {{mqtt_port}}
  username: {{mqtt_user}}
  password: "{{mqtt_password}}"
  client_id: {{device_id}}
  discovery: false

sensor:
  - platform: dht
    pin: {{pin}}
    model: DHT22
    update_interval: 15s
    temperature:
      name: "Temperature"
      on_value:
        then:
          - mqtt.publish_json:
              topic: {{telemetry_topic}}
              payload: |-
                root["value"] = x;
                root["unit"] = "{{unit}}";
`,
    }],
    links: [{ title: 'ESPHome MQTT', url: 'https://esphome.io/components/mqtt.html' }],
    notes: 'ESPHome ยังพยายามส่งหัวข้อสถานะของตัวเองด้วย ซึ่ง broker จะปฏิเสธเพราะสิทธิ์จำกัดเฉพาะหัวข้อของอุปกรณ์ — ไม่กระทบการทำงาน',
    tags: ['esphome', 'mqtt', 'yaml'],
  },
];

// ---------- เกตเวย์/บริดจ์ (ต้องมีตัวกลาง เช่น Node-RED) ----------
const NODE_RED_STEPS = [
  'ติดตั้ง Node-RED (หรือใช้ที่มีอยู่) และสร้าง flow: [รับข้อมูลจากต้นทาง] → [function แปลง] → [mqtt out]',
  'ตั้งค่าโหนด mqtt out ให้เชื่อมต่อ Server = {{mqtt_host}}:{{mqtt_port}} (TLS ถ้า 8883), Client ID = {{device_id}}, User = {{mqtt_user}}, Password = รหัสที่ระบบออกให้ และ Topic = {{telemetry_topic}}',
  'หนึ่งอุปกรณ์ในระบบ = หนึ่งค่า = หนึ่งชุดรหัส MQTT — ถ้าเซนเซอร์ส่งหลายค่า ให้สร้างหลายอุปกรณ์และหลายโหนด mqtt out',
];

const bridge = (id: string, vendor: string, model: string, description: string, fields: ProfileField[], fn: string, notes: string, tags: string[]): CatalogEntry => ({
  id,
  vendor,
  model,
  device_type: 'sensor',
  protocol: 'mqtt',
  integration: 'bridge',
  description,
  default_name: model,
  default_unit: null,
  fields,
  rtsp_templates: [],
  steps: NODE_RED_STEPS,
  snippets: [{ title: 'โค้ดในโหนด function ของ Node-RED', language: 'javascript', code: fn }],
  links: [{ title: 'Node-RED', url: 'https://nodered.org/docs/' }],
  notes,
  tags: ['bridge', 'node-red', ...tags],
});

const BRIDGES: CatalogEntry[] = [
  bridge('zigbee2mqtt-sensor', 'Zigbee2MQTT', 'เซนเซอร์ Zigbee ผ่าน Zigbee2MQTT (Aqara, Sonoff SNZB ฯลฯ)', 'Zigbee2MQTT ส่งข้อมูลหลายค่าใน JSON เดียวที่ zigbee2mqtt/<ชื่ออุปกรณ์> — ใช้ Node-RED ดึงค่าที่ต้องการส่งต่อ', [
    { key: 'z2m_topic', label: 'หัวข้อของ Zigbee2MQTT', default: 'zigbee2mqtt/ชื่ออุปกรณ์' },
    { key: 'key', label: 'ชื่อคีย์ที่จะส่ง', default: 'temperature' },
    { key: 'unit', label: 'หน่วย', default: '°C' },
  ], `// ต่อ mqtt in (หัวข้อ {{z2m_topic}}) -> function นี้ -> mqtt out (หัวข้อ {{telemetry_topic}})
const v = msg.payload["{{key}}"];
if (typeof v !== "number") return null;
msg.payload = { value: v, unit: "{{unit}}" };
msg.topic = "{{telemetry_topic}}";
return msg;`, 'ต้องมีตัวกลางที่เชื่อมสองโบรกเกอร์ (Zigbee2MQTT ในบ้าน → โบรกเกอร์ของระบบ) — ไม่ใช่การเชื่อมตรง', ['zigbee']),
  bridge('modbus-meter', 'Modbus', 'มิเตอร์ไฟ/PLC ผ่าน Modbus RTU/TCP', 'อ่านรีจิสเตอร์ Modbus (เช่น มิเตอร์พลังงาน, อินเวอร์เตอร์, PLC) ด้วย node-red-contrib-modbus แล้วส่งค่าเข้าระบบ', [
    { key: 'scale', label: 'ตัวคูณปรับสเกล', default: '0.1' },
    { key: 'unit', label: 'หน่วย', default: 'kWh' },
  ], `// ต่อ modbus-flex-getter / modbus-read -> function นี้ -> mqtt out
const raw = Array.isArray(msg.payload) ? msg.payload[0] : msg.payload;
if (typeof raw !== "number") return null;
msg.payload = { value: raw * {{scale}}, unit: "{{unit}}" };
msg.topic = "{{telemetry_topic}}";
return msg;`, 'ที่อยู่รีจิสเตอร์/ชนิดข้อมูล (16/32 บิต, endian) ขึ้นกับอุปกรณ์ — ดูคู่มือ Modbus map ของรุ่นนั้น', ['modbus', 'industrial']),
  bridge('lorawan-uplink', 'LoRaWAN', 'เซนเซอร์ LoRaWAN (ChirpStack / The Things Stack)', 'รับ uplink จาก network server ผ่าน MQTT แล้วดึงค่าจาก decoded payload ส่งเข้าระบบ', [
    { key: 'uplink_topic', label: 'หัวข้อ uplink ของ network server', default: 'application/1/device/+/event/up' },
    { key: 'object_key', label: 'คีย์ใน decoded object', default: 'temperature' },
    { key: 'unit', label: 'หน่วย', default: '°C' },
  ], `// ต่อ mqtt in ({{uplink_topic}}) -> function นี้ -> mqtt out
// ChirpStack: msg.payload.object.<คีย์>   |   TTN: msg.payload.uplink_message.decoded_payload.<คีย์>
const p = msg.payload;
const obj = (p && p.object) || (p && p.uplink_message && p.uplink_message.decoded_payload) || {};
const v = obj["{{object_key}}"];
if (typeof v !== "number") return null;
msg.payload = { value: v, unit: "{{unit}}" };
msg.topic = "{{telemetry_topic}}";
return msg;`, 'ต้องตั้ง payload decoder ใน network server ให้ได้ค่าตัวเลขก่อน', ['lora', 'lorawan']),
];

export const BUILTIN_PROFILES: CatalogEntry[] = [...CAMERAS, ...MQTT_DEVICES, ...BRIDGES];
