<#
.SYNOPSIS
  ส่งภาพจากเว็บแคมของคอม (Windows) เข้า MediaMTX เป็นสตรีม RTSP ชื่อ path "webcam"

.DESCRIPTION
  ffmpeg จับภาพจากเว็บแคมผ่าน DirectShow, เข้ารหัส H.264 แล้วส่งไปที่ rtsp://localhost:8554/webcam
  จากนั้นในแอป: เพิ่ม device ประเภท "กล้อง" แล้วตั้ง RTSP source เป็น rtsp://localhost:8554/webcam
  (backend/MediaMTX รันใน Docker เครื่องเดียวกัน ดึงสตรีมจากตัวเองผ่านพอร์ต 8554)

.EXAMPLE
  .\scripts\webcam-stream.ps1                     # เลือกกล้องตัวแรกอัตโนมัติ
  .\scripts\webcam-stream.ps1 -ListDevices        # แสดงรายชื่อกล้อง
  .\scripts\webcam-stream.ps1 -Camera "Integrated Camera" -Fps 15 -Size 640x480
#>
param(
  [string]$Camera = '',
  [string]$Path = 'webcam',
  [string]$Server = 'localhost:8554',
  [int]$Fps = 15,
  [string]$Size = '640x480',
  [switch]$ListDevices
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host 'ไม่พบ ffmpeg ติดตั้งด้วย: winget install Gyan.FFmpeg  (แล้วเปิด PowerShell ใหม่)' -ForegroundColor Red
  exit 1
}

# ffmpeg พิมพ์รายชื่ออุปกรณ์ลง stderr จึงรันผ่าน cmd เพื่อรวม stream และไม่ให้ PowerShell มองเป็น error
$raw = cmd /c 'ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1'
$cameras = @()
$inVideoSection = $false
foreach ($line in $raw) {
  if ($line -match '"([^"]+)"\s+\(video\)') { $cameras += $Matches[1]; continue }   # ffmpeg รุ่นใหม่
  if ($line -match 'DirectShow video devices') { $inVideoSection = $true; continue }   # ffmpeg รุ่นเก่า
  if ($line -match 'DirectShow audio devices') { $inVideoSection = $false; continue }
  if ($inVideoSection -and $line -match '"([^"]+)"' -and $line -notmatch 'Alternative name') { $cameras += $Matches[1] }
}
$cameras = @($cameras | Select-Object -Unique)   # ครอบด้วย @() กันกรณีมีกล้องตัวเดียวแล้วกลายเป็น string

if ($ListDevices) {
  if ($cameras.Count -eq 0) { Write-Host 'ไม่พบกล้อง' } else { $cameras | ForEach-Object { Write-Host " - $_" } }
  exit 0
}

if (-not $Camera) {
  if ($cameras.Count -eq 0) {
    Write-Host 'ไม่พบเว็บแคม ตรวจว่ากล้องเสียบอยู่ และ Settings > Privacy > Camera อนุญาตให้แอป Desktop ใช้กล้อง' -ForegroundColor Red
    exit 1
  }
  $Camera = $cameras[0]
}

$target = "rtsp://$Server/$Path"
Write-Host "กล้อง : $Camera"
Write-Host "ส่งไป : $target  ($Size @ ${Fps}fps)"
Write-Host 'กด Ctrl+C เพื่อหยุด'
Write-Host ''

# ส่งใหม่อัตโนมัติถ้า ffmpeg หลุด (เช่น MediaMTX รีสตาร์ต)
while ($true) {
  & ffmpeg -hide_banner -loglevel warning `
    -f dshow -rtbufsize 64M -framerate $Fps -video_size $Size -i "video=$Camera" `
    -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -g ($Fps * 2) -b:v 1000k `
    -f rtsp -rtsp_transport tcp $target
  Write-Host 'ffmpeg หยุดทำงาน จะลองเชื่อมต่อใหม่ใน 3 วินาที (Ctrl+C เพื่อออก)...' -ForegroundColor Yellow
  Start-Sleep -Seconds 3
}
