import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ana García' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'ContraseñaSegura123', minLength: 8, description: 'Mínimo 8 caracteres, con al menos una letra y un número.' })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'La contraseña debe incluir al menos una letra y un número.' })
  password: string;
}
