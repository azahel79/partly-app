import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendSellerMessageDto {
  @ApiProperty({ example: 'Ya está todo listo, solo falta que subas las credenciales de la cuenta.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message: string;
}
