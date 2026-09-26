import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crea una categoría del catálogo (solo ADMIN)' })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  @ApiResponse({ status: 409, description: 'Ya existe una categoría con ese nombre.' })
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.categoriesService.create(dto);
    return new CategoryResponseDto(category);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todas las categorías (público, primer filtro de búsqueda)' })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoriesService.findAll();
    return categories.map((c) => new CategoryResponseDto(c));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una categoría (público)' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 404, description: 'No existe.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryResponseDto> {
    const category = await this.categoriesService.findById(id);
    return new CategoryResponseDto(category);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renombra una categoría (solo ADMIN)' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.categoriesService.update(id, dto);
    return new CategoryResponseDto(category);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Elimina una categoría (solo ADMIN)',
    description: 'Los servicios que la tenían asignada simplemente pierden esa etiqueta; no se borran.',
  })
  @ApiResponse({ status: 204 })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.categoriesService.remove(id);
  }
}
