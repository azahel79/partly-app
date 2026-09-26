import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePlatformDto {
  @ApiProperty({ example: 'Netflix' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logos/netflix.png' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    type: [String],
    example: ['b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10'],
    description: 'IDs de las categorías a las que pertenece (al menos una)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  categoryIds: string[];
}
