import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PlatformsService } from './platforms.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';
import { PlatformResponseDto } from './dto/platform-response.dto';
import { ListPlatformsQueryDto } from './dto/list-platforms-query.dto';
import { PaginatedPlatformsResponseDto } from './dto/paginated-platforms-response.dto';

@ApiTags('platforms')
@Controller('platforms')
export class PlatformsController {
  constructor(private readonly platformsService: PlatformsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crea un servicio (Netflix, Spotify...) con sus categorías (solo ADMIN)' })
  @ApiResponse({ status: 201, type: PlatformResponseDto })
  @ApiResponse({ status: 400, description: 'Alguna categoría no existe.' })
  async create(@Body() dto: CreatePlatformDto): Promise<PlatformResponseDto> {
    const platform = await this.platformsService.create(dto);
    return new PlatformResponseDto(platform);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista servicios con filtros y paginación (público, segundo filtro de búsqueda)',
    description: 'Filtra por categoría, texto de búsqueda por nombre, y si está activo.',
  })
  @ApiResponse({ status: 200, type: PaginatedPlatformsResponseDto })
  async findAll(@Query() query: ListPlatformsQueryDto): Promise<PaginatedPlatformsResponseDto> {
    const { data, total } = await this.platformsService.findMany(query);
    return {
      data: data.map((p) => new PlatformResponseDto(p)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un servicio, con sus categorías (público)' })
  @ApiResponse({ status: 200, type: PlatformResponseDto })
  @ApiResponse({ status: 404, description: 'No existe.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformResponseDto> {
    const platform = await this.platformsService.findById(id);
    return new PlatformResponseDto(platform);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Actualiza un servicio (solo ADMIN)',
    description: 'Si envías categoryIds, reemplaza el set completo de categorías del servicio.',
  })
  @ApiResponse({ status: 200, type: PlatformResponseDto })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlatformDto): Promise<PlatformResponseDto> {
    const platform = await this.platformsService.update(id, dto);
    return new PlatformResponseDto(platform);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina un servicio (solo ADMIN)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Tiene planes asociados; hay que borrarlos/reasignarlos primero.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.platformsService.remove(id);
  }
}
