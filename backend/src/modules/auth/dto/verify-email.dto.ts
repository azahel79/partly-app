import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Token recibido por correo tras el registro.' })
  @IsString()
  token: string;
}
