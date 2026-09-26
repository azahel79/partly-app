import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AddIncidentMessageDto {
  @ApiProperty({ example: 'Ya revisé, parece que alguien más cambió el perfil.' })
  @IsString()
  @MinLength(1)
  body: string;
}
