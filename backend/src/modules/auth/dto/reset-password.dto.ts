import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token de un solo uso recibido por correo' })
  @IsString()
  token: string;

  @ApiProperty({
    example: 'NuevaContraseñaSegura123',
    minLength: 8,
    description: 'Mínimo 8 caracteres, con al menos una letra y un número.',
  })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'La contraseña debe incluir al menos una letra y un número.' })
  newPassword: string;
}
