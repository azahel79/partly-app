import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Entretenimiento' })
  @IsString()
  @MinLength(2)
  name: string;
}
