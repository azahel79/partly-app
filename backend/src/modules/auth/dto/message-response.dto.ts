import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ example: 'Revisa tu correo para verificar tu cuenta.' })
  message: string;
}
