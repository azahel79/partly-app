import { ApiProperty } from '@nestjs/swagger';
import { ProviderListingResponseDto } from './provider-listing-response.dto';

export class PaginatedProviderListingsResponseDto {
  @ApiProperty({ type: [ProviderListingResponseDto] })
  data: ProviderListingResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
