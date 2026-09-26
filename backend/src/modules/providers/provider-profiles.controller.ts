import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ProviderProfilesService } from './provider-profiles.service';
import { ApplyProviderProfileDto } from './dto/apply-provider-profile.dto';
import { ReviewProviderProfileDto } from './dto/review-provider-profile.dto';
import { ProviderProfileResponseDto } from './dto/provider-profile-response.dto';
import { ListProviderProfilesQueryDto } from './dto/list-provider-profiles-query.dto';
import { PaginatedProviderProfilesResponseDto } from './dto/paginated-provider-profiles-response.dto';

@ApiTags('provider-profiles')
@Controller('provider-profiles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProviderProfilesController {
  constructor(private readonly providerProfilesService: ProviderProfilesService) {}

  @Post('me')
  @ApiOperation({ summary: 'Activa tu perfil de proveedor para vender cuentas al por mayor (solo ADMIN, queda APPROVED de inmediato)' })
  @ApiResponse({ status: 201, type: ProviderProfileResponseDto })
  @ApiResponse({ status: 403, description: 'No eres administrador.' })
  @ApiResponse({ status: 409, description: 'Ya tienes un perfil de proveedor.' })
  async apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApplyProviderProfileDto,
  ): Promise<ProviderProfileResponseDto> {
    const profile = await this.providerProfilesService.apply(user, dto);
    return new ProviderProfileResponseDto(profile);
  }

  @Get('me')
  @ApiOperation({ summary: 'Tu perfil de proveedor y su estado actual' })
  @ApiResponse({ status: 200, type: ProviderProfileResponseDto })
  @ApiResponse({ status: 404, description: 'Todavía no has solicitado ser proveedor.' })
  async findMine(@CurrentUser() user: AuthenticatedUser): Promise<ProviderProfileResponseDto> {
    const profile = await this.providerProfilesService.findMine(user.id);
    return new ProviderProfileResponseDto(profile);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lista todos los perfiles de proveedor, para revisar solicitudes (solo ADMIN)' })
  @ApiResponse({ status: 200, type: PaginatedProviderProfilesResponseDto })
  async findAll(@Query() query: ListProviderProfilesQueryDto): Promise<PaginatedProviderProfilesResponseDto> {
    const { data, total } = await this.providerProfilesService.findAll(query);
    return {
      data: data.map((p) => new ProviderProfileResponseDto(p)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Put(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Aprueba, suspende o rechaza a un proveedor (solo ADMIN)',
    description: 'PENDING → APPROVED/REJECTED. APPROVED ↔ SUSPENDED se puede alternar.',
  })
  @ApiResponse({ status: 200, type: ProviderProfileResponseDto })
  @ApiResponse({ status: 400, description: 'Transición de estado inválida.' })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewProviderProfileDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<ProviderProfileResponseDto> {
    const profile = await this.providerProfilesService.review(id, dto.status, admin.id);
    return new ProviderProfileResponseDto(profile);
  }
}
