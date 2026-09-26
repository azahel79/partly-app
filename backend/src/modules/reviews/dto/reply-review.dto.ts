import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReplyReviewDto {
  @ApiProperty({ example: 'Gracias por tu comentario, cualquier detalle con la cuenta me avisas.' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reply: string;
}
