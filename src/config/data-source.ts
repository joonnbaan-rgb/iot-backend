import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'iot',
  password: process.env.DB_PASSWORD || 'iot_password',
  database: process.env.DB_NAME || 'iot_backend',
  // ใช้ glob หา entity ทุกไฟล์ *.entity.ts อัตโนมัติ แทนการ hardcode list
  // (กัน bug แบบ "ลืมเพิ่ม entity ใหม่ในนี้" ที่เจอใน Phase 4)
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/../migrations/*.{ts,js}'],
  synchronize: false, // ใช้ migration แทนเสมอ ไม่ให้ TypeORM auto-sync schema
  logging: process.env.NODE_ENV === 'development',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
