import { IsEmail } from 'class-validator';

export class TransferDeviceDto {
  @IsEmail()
  email: string;
}
