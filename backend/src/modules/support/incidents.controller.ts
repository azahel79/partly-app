import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { AddIncidentMessageDto } from './dto/add-incident-message.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { IncidentResponseDto } from './dto/incident-response.dto';
import { IncidentMessageResponseDto } from './dto/incident-message-response.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { PaginatedIncidentsResponseDto } from './dto/paginated-incidents-response.dto';

@ApiTags('incidents')
@Controller('incidents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Abre una incidencia: comprador sobre su membresía, o vendedor sobre una compra a proveedor',
    description: 'Se asigna sola al dueño del grupo (GROUP_MEMBERSHIP) o al proveedor (PROVIDER_ORDER) — no la elige quien reporta.',
  })
  @ApiResponse({ status: 201, type: IncidentResponseDto })
  @ApiResponse({ status: 403, description: 'No eres parte de esa membresía/orden.' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateIncidentDto): Promise<IncidentResponseDto> {
    const incident = await this.incidentsService.create(user.id, dto);
    return new IncidentResponseDto(incident);
  }

  @Get('me')
  @ApiOperation({ summary: 'Tus incidencias (como quien reportó o como quien debe responder)' })
  @ApiResponse({ status: 200, type: PaginatedIncidentsResponseDto })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListIncidentsQueryDto,
  ): Promise<PaginatedIncidentsResponseDto> {
    const { data, total } = await this.incidentsService.findMine(user.id, query);
    return {
      data: data.map((i) => new IncidentResponseDto(i)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lista todas las incidencias, ej. filtrando status=ESCALATED (solo ADMIN)' })
  @ApiResponse({ status: 200, type: PaginatedIncidentsResponseDto })
  async findAll(@Query() query: ListIncidentsQueryDto): Promise<PaginatedIncidentsResponseDto> {
    const { data, total } = await this.incidentsService.findAllForAdmin(query);
    return {
      data: data.map((i) => new IncidentResponseDto(i)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una incidencia (reportante, asignado, o ADMIN)' })
  @ApiResponse({ status: 200, type: IncidentResponseDto })
  @ApiResponse({ status: 403, description: 'No tienes acceso a esta incidencia.' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentResponseDto> {
    const incident = await this.incidentsService.findById(id, user);
    return new IncidentResponseDto(incident);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Hilo de mensajes de una incidencia' })
  @ApiResponse({ status: 200, type: [IncidentMessageResponseDto] })
  async findMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentMessageResponseDto[]> {
    const messages = await this.incidentsService.findMessages(id, user);
    return messages.map((m) => new IncidentMessageResponseDto(m));
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Agrega un mensaje al hilo de la incidencia' })
  @ApiResponse({ status: 201, type: IncidentMessageResponseDto })
  @ApiResponse({ status: 400, description: 'La incidencia ya está resuelta.' })
  async addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddIncidentMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentMessageResponseDto> {
    const message = await this.incidentsService.addMessage(id, dto, user);
    return new IncidentMessageResponseDto(message);
  }

  @Put(':id/status')
  @ApiOperation({
    summary: 'Cambia el estado de la incidencia',
    description: 'OPEN → IN_REVIEW/RESOLVED/ESCALATED. Una vez ESCALATED, solo un ADMIN puede moverla.',
  })
  @ApiResponse({ status: 200, type: IncidentResponseDto })
  @ApiResponse({ status: 400, description: 'Transición de estado inválida.' })
  @ApiResponse({ status: 403, description: 'Está escalada: solo un ADMIN puede cambiarla.' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentResponseDto> {
    const incident = await this.incidentsService.updateStatus(id, dto.status, user);
    return new IncidentResponseDto(incident);
  }
}
