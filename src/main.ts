import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // อยู่หลัง reverse proxy (Caddy) บน cloud: เชื่อ X-Forwarded-For 1 ชั้น เพื่อให้ rate limit แยกตาม IP จริงของผู้ใช้
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 IoT backend กำลังทำงานที่ port ${port}`);
}
bootstrap();
