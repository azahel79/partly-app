import { ApiProperty } from '@nestjs/swagger';
import { Category, Platform } from '@prisma/client';
import { Exclude, Expose, Type } from 'class-transformer';
import { CategoryResponseDto } from '../../categories/dto/category-response.dto';

type PlatformWithCategories = Platform & { categories: { category: Category }[] };

@Exclude()
export class PlatformResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Netflix' })
  @Expose()
  name: string;

  @ApiProperty({ example: 'https://cdn.example.com/logos/netflix.png', nullable: true })
  @Expose()
  logoUrl: string | null;

  @ApiProperty({ example: true })
  @Expose()
  active: boolean;

  @ApiProperty({ type: [CategoryResponseDto] })
  @Expose()
  @Type(() => CategoryResponseDto)
  categories: CategoryResponseDto[];

  constructor(platform: PlatformWithCategories) {
    this.id = platform.id;
    this.name = platform.name;
    this.logoUrl = platform.logoUrl;
    this.active = platform.active;
    this.categories = platform.categories.map((pc) => new CategoryResponseDto(pc.category));
  }
}
