import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertCredentialDto {
  @ApiProperty({ example: 'cuenta.compartida@example.com' })
  @IsString()
  @MinLength(1)
  username: string;

  @ApiProperty({ example: 'ContraseñaRealDeNetflix123' })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({ example: 'El perfil "Casa" es para los miembros, no toquen los otros.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Rotación mensual de seguridad' })
  @IsOptional()
  @IsString()
  changeReason?: string;
}
