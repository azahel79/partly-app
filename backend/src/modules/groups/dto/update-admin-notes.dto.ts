import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateAdminNotesDto {
  @ApiProperty({ example: 'Vendedor confiable, ya tiene 3 grupos aprobados antes.', description: 'Manda vacío para borrar la nota.' })
  @IsString()
  @MaxLength(2000)
  notes: string;
}
