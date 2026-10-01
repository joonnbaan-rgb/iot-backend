import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SetCameraSourceDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^rtsps?:\/\/.+/, {
    message: 'rtsp_url ต้องขึ้นต้นด้วย rtsp:// หรือ rtsps://',
  })
  rtsp_url: string;
}
