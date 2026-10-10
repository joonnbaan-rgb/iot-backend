# สร้างเป็น deploy/mediamtx.prod.yml โดย deploy/init.sh (แทนค่าผู้ใช้/รหัสผ่านที่ publish ได้)
api: yes
apiAddress: :9997

# ไม่มีใครเข้าถึง API/สตรีมได้ถ้าไม่ตรงกฎด้านล่าง
authInternalUsers:
  # backend (อยู่ในเครือข่าย docker) เรียก API เพิ่ม/ลบ path ได้
  - user: any
    pass:
    ips: ['172.16.0.0/12', '10.0.0.0/8', '127.0.0.1', '::1']
    permissions:
      - action: api
      - action: read
      - action: publish
      - action: playback
  # ผู้ใช้ที่ส่งภาพกล้องจากบ้านขึ้นมา: publish ได้อย่างเดียว
  - user: __RTSP_PUBLISH_USER__
    pass: __RTSP_PUBLISH_PASS__
    ips: []
    permissions:
      - action: publish
  # ดู HLS ผ่าน Caddy (Caddy มาจากเครือข่ายภายใน จึงเข้ากฎแรก) ไม่เปิดให้ read จากภายนอกโดยตรง

rtsp: yes
rtspAddress: :8554

hls: yes
hlsAddress: :8888
hlsAllowOrigin: '*'

# ปิด WebRTC บน cloud (แอปใช้ HLS) ลดพอร์ตที่เปิดสู่อินเทอร์เน็ต
webrtc: no

paths:
  all_others:
