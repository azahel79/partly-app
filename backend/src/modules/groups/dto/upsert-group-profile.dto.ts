import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertGroupProfileDto {
  @ApiProperty({ example: 'Perfil 1', description: 'Nombre visible del perfil dentro de la cuenta compartida.' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;
}
