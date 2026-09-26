import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ExchangeGoogleCodeDto {
  @ApiProperty({ description: 'Código de un solo uso recibido en ?code= tras el callback de Google' })
  @IsString()
  code: string;
}
