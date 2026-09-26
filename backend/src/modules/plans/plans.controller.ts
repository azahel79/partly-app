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
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { ListPlansQueryDto } from './dto/list-plans-query.dto';
import { PaginatedPlansResponseDto } from './dto/paginated-plans-response.dto';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crea un plan (variante de un servicio, ej. "Netflix 4 pantallas") (solo ADMIN)' })
  @ApiResponse({ status: 201, type: PlanResponseDto })
  @ApiResponse({ status: 404, description: 'El servicio (platformId) no existe.' })
  async create(@Body() dto: CreatePlanDto): Promise<PlanResponseDto> {
    const plan = await this.plansService.create(dto);
    return new PlanResponseDto(plan);
  }

  @Get()
  @ApiOperation({ summary: 'Lista planes con filtros y paginación (público, tercer eslabón de búsqueda)' })
  @ApiResponse({ status: 200, type: PaginatedPlansResponseDto })
  async findAll(@Query() query: ListPlansQueryDto): Promise<PaginatedPlansResponseDto> {
    const { data, total } = await this.plansService.findMany(query);
    return {
      data: data.map((p) => new PlanResponseDto(p)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un plan (público)' })
  @ApiResponse({ status: 200, type: PlanResponseDto })
  @ApiResponse({ status: 404, description: 'No existe.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PlanResponseDto> {
    const plan = await this.plansService.findById(id);
    return new PlanResponseDto(plan);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualiza un plan (solo ADMIN)' })
  @ApiResponse({ status: 200, type: PlanResponseDto })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto): Promise<PlanResponseDto> {
    const plan = await this.plansService.update(id, dto);
    return new PlanResponseDto(plan);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina un plan (solo ADMIN)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Tiene grupos asociados; hay que resolverlos primero.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.plansService.remove(id);
  }
}
