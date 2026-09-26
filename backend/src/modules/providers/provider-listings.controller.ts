import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ProviderListingsService } from './provider-listings.service';
import { CreateProviderListingDto } from './dto/create-provider-listing.dto';
import { UpdateProviderListingDto } from './dto/update-provider-listing.dto';
import { ListProviderListingsQueryDto } from './dto/list-provider-listings-query.dto';
import { ProviderListingResponseDto } from './dto/provider-listing-response.dto';
import { PaginatedProviderListingsResponseDto } from './dto/paginated-provider-listings-response.dto';

@ApiTags('provider-listings')
@Controller('provider-listings')
export class ProviderListingsController {
  constructor(private readonly providerListingsService: ProviderListingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publica un servicio a la venta al por mayor (solo proveedor con perfil APPROVED)' })
  @ApiResponse({ status: 201, type: ProviderListingResponseDto })
  @ApiResponse({ status: 403, description: 'No tienes un perfil de proveedor aprobado.' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProviderListingDto,
  ): Promise<ProviderListingResponseDto> {
    const listing = await this.providerListingsService.create(user.id, dto);
    return new ProviderListingResponseDto(listing);
  }

  @Get()
  @ApiOperation({ summary: 'Explora los servicios disponibles al por mayor (público — lo ven los vendedores)' })
  @ApiResponse({ status: 200, type: PaginatedProviderListingsResponseDto })
  async findAll(@Query() query: ListProviderListingsQueryDto): Promise<PaginatedProviderListingsResponseDto> {
    const { data, total } = await this.providerListingsService.findMany(query);
    return {
      data: data.map((l) => new ProviderListingResponseDto(l)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tus propios servicios publicados (proveedor)' })
  @ApiResponse({ status: 200, type: [ProviderListingResponseDto] })
  async findMine(@CurrentUser() user: AuthenticatedUser): Promise<ProviderListingResponseDto[]> {
    const listings = await this.providerListingsService.findMine(user.id);
    return listings.map((l) => new ProviderListingResponseDto(l));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un servicio de proveedor (público)' })
  @ApiResponse({ status: 200, type: ProviderListingResponseDto })
  @ApiResponse({ status: 404, description: 'No existe.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderListingResponseDto> {
    const listing = await this.providerListingsService.findById(id);
    return new ProviderListingResponseDto(listing);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualiza precio, stock o estado activo de tu servicio (solo el proveedor dueño, o ADMIN)' })
  @ApiResponse({ status: 200, type: ProviderListingResponseDto })
  @ApiResponse({ status: 403, description: 'No eres el proveedor dueño de este servicio.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderListingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderListingResponseDto> {
    const listing = await this.providerListingsService.update(id, dto, user);
    return new ProviderListingResponseDto(listing);
  }
}
