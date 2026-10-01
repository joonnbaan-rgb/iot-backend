# สร้าง self-signed certificate สำหรับ dev/test (ใช้ OpenSSL ที่มากับ Git for Windows หรือ Docker Desktop)
# รันจาก: C:\Projects\iot-backend\phase8\nginx\
#
# วิธีที่ 1: ถ้ามี openssl ใน PATH (Git for Windows มักมีให้)
#   openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
#     -keyout certs/server.key -out certs/server.crt `
#     -subj "/C=TH/ST=Bangkok/L=Bangkok/O=IoTBackend/CN=localhost"
#
# วิธีที่ 2: ใช้ container ที่มี openssl ติดตั้งอยู่ (ไม่ต้องติดตั้งอะไรเพิ่มบนเครื่อง)
docker run --rm -v "${PWD}/certs:/certs" alpine/openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout /certs/server.key -out /certs/server.crt `
  -subj "/C=TH/ST=Bangkok/L=Bangkok/O=IoTBackend/CN=localhost"

Write-Host "สร้าง certs/server.crt และ certs/server.key เรียบร้อยแล้ว"
Write-Host "หมายเหตุ: เป็น self-signed cert ใช้สำหรับ dev เท่านั้น เบราว์เซอร์จะเตือนว่าไม่ปลอดภัย (คลิก Advanced > Proceed ได้)"
