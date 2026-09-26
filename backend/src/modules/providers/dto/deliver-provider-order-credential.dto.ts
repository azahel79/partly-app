import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class DeliverProviderOrderCredentialDto {
  @ApiProperty({ example: 'cuenta.mayoreo@example.com' })
  @IsString()
  @MinLength(1)
  username: string;

  @ApiProperty({ example: 'ContraseñaRealDeLaCuenta123' })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({ example: 'Usa el perfil 3, PIN 1234.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
