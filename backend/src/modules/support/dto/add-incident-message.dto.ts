import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IncidentMessageAudience } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class AddIncidentMessageDto {
  @ApiProperty({ example: 'Ya cambié la contraseña, revisa el grupo.' })
  @IsString()
  @MinLength(1)
  body: string;

  @ApiPropertyOptional({
    enum: IncidentMessageAudience,
    description: 'ALL = lo ven todos. REPORTER / ASSIGNEE = privado entre Tequio y quien reportó / el responsable.',
  })
  @IsOptional()
  @IsEnum(IncidentMessageAudience)
  audience?: IncidentMessageAudience;
}
