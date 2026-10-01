# Backup script สำหรับ IoT Backend
# - Dump ฐานข้อมูล TimescaleDB (pg_dump ผ่าน docker exec)
# - สำรอง MinIO data volume (tar ผ่าน alpine container ชั่วคราว ไม่ต้องพึ่ง mc CLI)
#
# วิธีใช้: .\backup.ps1 [-OutDir "C:\Backups\iot-backend"]

param(
  [string]$OutDir = "$PSScriptRoot\..\backups"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $OutDir $timestamp
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

Write-Host "==> สำรองข้อมูลไปที่: $backupDir"

# --- 1) Dump ฐานข้อมูล TimescaleDB/Postgres ---
Write-Host "==> กำลัง dump ฐานข้อมูล (pg_dump)..."
$dbContainer = "iot-timescaledb"
$dbUser = "iot"
$dbName = "iot_backend"

$dumpFile = Join-Path $backupDir "db_dump.sql"
docker exec $dbContainer pg_dump -U $dbUser -F p -d $dbName > $dumpFile

if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump ล้มเหลว — ตรวจสอบว่า container '$dbContainer' กำลังทำงานอยู่ และชื่อ user/db ถูกต้อง"
  exit 1
}
Write-Host "   บันทึกแล้ว: $dumpFile"

# --- 2) สำรอง MinIO data volume ---
Write-Host "==> กำลังสำรอง MinIO data volume..."
$minioVolume = "iot-backend_minio_data"   # ชื่อ volume มักเป็น <project_name>_minio_data — ตรวจสอบด้วย `docker volume ls` หากไม่ตรง
$minioTarFile = "minio_data.tar.gz"

docker run --rm `
  -v "${minioVolume}:/data" `
  -v "${backupDir}:/backup" `
  alpine sh -c "cd /data && tar czf /backup/$minioTarFile ."

if ($LASTEXITCODE -ne 0) {
  Write-Warning "สำรอง MinIO volume ล้มเหลว — ตรวจสอบชื่อ volume ด้วย 'docker volume ls' แล้วแก้ไขตัวแปร `$minioVolume ในสคริปต์นี้"
} else {
  Write-Host "   บันทึกแล้ว: $(Join-Path $backupDir $minioTarFile)"
}

# --- 3) สรุปผล ---
Write-Host ""
Write-Host "==> สำรองข้อมูลเสร็จสิ้น: $backupDir"
Get-ChildItem $backupDir | Format-Table Name, Length, LastWriteTime

Write-Host ""
Write-Host "วิธีกู้คืนฐานข้อมูล:"
Write-Host "  Get-Content db_dump.sql | docker exec -i $dbContainer psql -U $dbUser -d $dbName"
Write-Host ""
Write-Host "วิธีกู้คืน MinIO volume:"
Write-Host "  docker run --rm -v ${minioVolume}:/data -v `"<backup_dir>`":/backup alpine sh -c `"cd /data && tar xzf /backup/$minioTarFile`""
