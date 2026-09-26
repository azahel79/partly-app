import { ApiProperty } from '@nestjs/swagger';
import { Category } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class CategoryResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Entretenimiento' })
  @Expose()
  name: string;

  @ApiProperty({ example: '2026-09-08T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  constructor(partial: Partial<Category>) {
    Object.assign(this, partial);
  }
}
