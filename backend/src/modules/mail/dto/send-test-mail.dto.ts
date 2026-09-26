import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class SendTestMailDto {
  @ApiPropertyOptional({ description: 'A quién se manda la prueba. Por defecto, al correo del admin que la pide.' })
  @IsOptional()
  @IsEmail()
  to?: string;
}
