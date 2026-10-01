import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CommandRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  action: string; // เช่น "turn_on", "turn_off"
}
