import { ApiProperty } from '@nestjs/swagger';
import { ProviderOrderResponseDto } from './provider-order-response.dto';

export class PaginatedProviderOrdersResponseDto {
  @ApiProperty({ type: [ProviderOrderResponseDto] })
  data: ProviderOrderResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
