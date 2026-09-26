import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ListGroupsQueryDto } from './dto/list-groups-query.dto';
import { ListPendingGroupsQueryDto } from './dto/list-pending-groups-query.dto';
import { ListAdminGroupsQueryDto } from './dto/list-admin-groups-query.dto';
import { AdminGroupDetailResponseDto } from './dto/admin-group-detail-response.dto';
import { UpdateAdminNotesDto } from './dto/update-admin-notes.dto';
import { SendSellerMessageDto } from './dto/send-seller-message.dto';
import { ReviewGroupApprovalDto } from './dto/review-group-approval.dto';
import { GroupResponseDto } from './dto/group-response.dto';
import { PaginatedGroupsResponseDto } from './dto/paginated-groups-response.dto';
import { MembershipResponseDto } from './dto/membership-response.dto';
import { ProposeCommissionDto } from './dto/propose-commission.dto';
import { SetAutoRenewDto } from './dto/set-auto-renew.dto';
import { UpsertCredentialDto } from './dto/upsert-credential.dto';
import { CredentialResponseDto } from './dto/credential-response.dto';
import { CredentialHistoryResponseDto } from './dto/credential-history-response.dto';
import { UpsertGroupProfileDto } from './dto/upsert-group-profile.dto';
import { GroupProfileResponseDto } from './dto/group-profile-response.dto';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crea un grupo (te conviertes en el owner) a partir de un plan existente' })
  @ApiResponse({ status: 201, type: GroupResponseDto })
  @ApiResponse({ status: 400, description: 'availableSlots supera lo que permite el plan, o el plan no está activo.' })
  @ApiResponse({ status: 404, description: 'El plan indicado no existe.' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGroupDto): Promise<GroupResponseDto> {
    const group = await this.groupsService.create(user.id, dto);
    return new GroupResponseDto(group);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Busca grupos con cupo disponible para el comprador — cuarto eslabón: categoría → servicio → plan → grupo',
    description: 'Por default solo muestra grupos en estado SEARCHING_MEMBERS y excluye los creados por el usuario actual. Filtros: planId, platformId, categoryId, status.',
  })
  @ApiResponse({ status: 200, type: PaginatedGroupsResponseDto })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListGroupsQueryDto): Promise<PaginatedGroupsResponseDto> {
    const { data, total } = await this.groupsService.findMany(query, user.id);
    return {
      data: data.map((g) => new GroupResponseDto(g)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get('public-stats')
  @ApiOperation({ summary: 'Estadísticas públicas del marketplace, sin autenticación (para la landing)' })
  @ApiResponse({ status: 200, schema: { example: { activeGroupsCount: 12 } } })
  async publicStats(): Promise<{ activeGroupsCount: number }> {
    const activeGroupsCount = await this.groupsService.countPublicActive();
    return { activeGroupsCount };
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista los grupos de los que eres owner (tu panel de vendedor)' })
  @ApiResponse({ status: 200, type: [GroupResponseDto] })
  async findMine(@CurrentUser() user: AuthenticatedUser): Promise<GroupResponseDto[]> {
    const groups = await this.groupsService.findMine(user.id);
    return groups.map((g) => new GroupResponseDto(g));
  }

  @Get('joined')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista únicamente tus suscripciones activas; los pagos iniciales pendientes no aparecen aquí' })
  @ApiResponse({ status: 200, type: [GroupResponseDto] })
  async findJoined(@CurrentUser() user: AuthenticatedUser): Promise<GroupResponseDto[]> {
    const groups = await this.groupsService.findJoined(user.id);
    return groups.map((g) => new GroupResponseDto(g));
  }

  @Get('pending-approval')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cola de grupos nuevos esperando aprobación (solo ADMIN)' })
  @ApiResponse({ status: 200, type: PaginatedGroupsResponseDto })
  async findPendingApproval(@Query() query: ListPendingGroupsQueryDto): Promise<PaginatedGroupsResponseDto> {
    const { data, total } = await this.groupsService.findPendingApproval(query);
    return {
      data: data.map((g) => new GroupResponseDto(g)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Todos los grupos con su estado de aprobación, para el panel de staff (solo ADMIN)' })
  @ApiResponse({ status: 200, type: PaginatedGroupsResponseDto })
  async findAllForAdmin(@Query() query: ListAdminGroupsQueryDto): Promise<PaginatedGroupsResponseDto> {
    const { data, total } = await this.groupsService.findAllForAdmin(query);
    return {
      data: data.map((g) => new GroupResponseDto(g)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle completo de un grupo para el panel de staff — incluye notas internas, ventas del vendedor y si ya tiene credenciales (solo ADMIN)' })
  @ApiResponse({ status: 200, type: AdminGroupDetailResponseDto })
  async findAdminDetail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminGroupDetailResponseDto> {
    return this.groupsService.findAdminDetail(id);
  }

  @Put(':id/admin-notes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Guarda una nota privada del admin sobre el grupo — nunca la ve el vendedor (solo ADMIN)' })
  @ApiResponse({ status: 200, type: AdminGroupDetailResponseDto })
  async updateAdminNotes(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminNotesDto): Promise<AdminGroupDetailResponseDto> {
    await this.groupsService.updateAdminNotes(id, dto.notes);
    return this.groupsService.findAdminDetail(id);
  }

  @Post(':id/message')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manda un mensaje directo al vendedor como notificación real (solo ADMIN)' })
  @ApiResponse({ status: 201, description: 'Mensaje enviado.' })
  async sendMessageToSeller(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendSellerMessageDto): Promise<void> {
    await this.groupsService.sendMessageToSeller(id, dto.message);
  }

  @Put(':id/commission')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Fija la comisión (10%-15%) de un grupo en revisión y avisa al vendedor (solo ADMIN)',
    description: 'Se puede hacer antes de pedir credenciales para que el vendedor sepa cuánto ganará y ajuste su precio.',
  })
  @ApiResponse({ status: 200, type: GroupResponseDto })
  @ApiResponse({ status: 400, description: 'Fuera del rango permitido o el grupo ya fue revisado.' })
  async proposeCommission(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProposeCommissionDto): Promise<GroupResponseDto> {
    const group = await this.groupsService.proposeCommission(id, dto.commissionPercentage);
    return new GroupResponseDto(group);
  }

  @Post(':id/request-credentials')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solicita formalmente las credenciales al vendedor para continuar la revisión (solo ADMIN)' })
  @ApiResponse({ status: 201, description: 'Solicitud enviada al vendedor.' })
  async requestCredentials(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.groupsService.requestCredentials(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un grupo (público)' })
  @ApiResponse({ status: 200, type: GroupResponseDto })
  @ApiResponse({ status: 404, description: 'No existe.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GroupResponseDto> {
    const group = await this.groupsService.findById(id);
    return new GroupResponseDto(group);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Actualiza tu grupo: precio, cupos, día de cobro, o pausar/reabrir/cancelar (solo el owner, o ADMIN)',
    description: 'El estado FULL se calcula automáticamente; aquí solo se puede poner SEARCHING_MEMBERS, PAUSED o CANCELLED.',
  })
  @ApiResponse({ status: 200, type: GroupResponseDto })
  @ApiResponse({ status: 403, description: 'No eres el owner de este grupo.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GroupResponseDto> {
    const group = await this.groupsService.update(id, dto, user);
    return new GroupResponseDto(group);
  }

  @Put(':id/approval')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Aprueba o rechaza un grupo nuevo (solo ADMIN)',
    description: 'Solo se puede aprobar un grupo PENDING cuando el vendedor ya envió las credenciales para revisión.',
  })
  @ApiResponse({ status: 200, type: GroupResponseDto })
  @ApiResponse({ status: 400, description: 'El grupo ya fue revisado.' })
  async reviewApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewGroupApprovalDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<GroupResponseDto> {
    const group = await this.groupsService.reviewApproval(id, dto.status, admin.id, dto.reason, dto.commissionPercentage);
    return new GroupResponseDto(group);
  }

  @Get(':id/join-preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cuánto pagarías al entrar a este grupo y por qué (prorrateo por los días restantes del ciclo)',
    description: 'Antes de que el vendedor inicie el grupo no se paga al reservar. Ya iniciado, se paga solo lo que resta del ciclo.',
  })
  async getJoinPreview(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.getJoinPreview(id);
  }

  @Get(':id/my-membership')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tu estado dentro de este grupo (cupo reservado, esperando pago, activo…), o null' })
  async findMyMembership(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.findMyMembership(id, user.id);
  }

  @Put(':id/my-membership/auto-renew')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activa o desactiva la renovación automática de tu lugar (sirve para quien solo quiere probar)' })
  async setAutoRenew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAutoRenewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groupsService.setAutoRenew(id, user.id, dto.autoRenew);
  }

  @Get(':id/start-preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Números para decidir si iniciar el grupo (solo el vendedor)',
    description: 'Cupos reservados vs. necesarios (75%), ingresos, comisión de Partly y ganancia contra lo que costó la cuenta.',
  })
  async getStartPreview(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.getStartPreview(id, user);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Inicia el servicio del grupo (solo el vendedor, con >=75% de cupos reservados)',
    description: 'Fija la fecha de renovación desde hoy y le genera a cada cupo reservado su pago con 48 horas para cubrirlo.',
  })
  @ApiResponse({ status: 201, type: GroupResponseDto })
  @ApiResponse({ status: 400, description: 'Ya inició, no está aprobado, faltan credenciales o no llega al 75%.' })
  async startGroup(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<GroupResponseDto> {
    const group = await this.groupsService.startGroup(id, user);
    return new GroupResponseDto(group);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reservas un cupo y quedas PENDING_PAYMENT',
    description:
      'Reserva el cupo y crea tu pago pendiente, pero no te da acceso todavía: sube tu comprobante ' +
      '(POST .../payments/receipt) y espera a que el owner lo apruebe (PUT .../payments/:paymentId/review) para ' +
      'pasar a ACTIVE. Si ya existe una solicitud PENDING_PAYMENT, continúa con ese mismo pago sin crear otra.',
  })
  @ApiResponse({ status: 201, type: MembershipResponseDto })
  @ApiResponse({ status: 400, description: 'Grupo lleno, pausado/cancelado, sin aprobar, o es tu propio grupo.' })
  @ApiResponse({ status: 409, description: 'Ya eres miembro activo de este grupo.' })
  async join(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<MembershipResponseDto> {
    const membership = await this.groupsService.join(id, user.id);
    return new MembershipResponseDto(membership);
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sales de un grupo del que eras miembro' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'No tienes una membresía activa en ese grupo.' })
  async leave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.groupsService.leave(id, user.id);
  }

  @Delete(':id/members/:membershipId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Saca a un miembro del grupo (solo el owner, o ADMIN)',
    description:
      'Distinto de que el miembro se vaya por su cuenta (POST .../leave). Libera el cupo y reabre el grupo si ' +
      'estaba FULL. No hay penalización ni reembolso todavía: no existe módulo de pagos, no hay nada real que ' +
      'devolver — pendiente para cuando se construya /payments.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'No eres el owner de este grupo.' })
  @ApiResponse({ status: 404, description: 'Esa membresía no existe o ya no está activa en este grupo.' })
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.groupsService.removeMember(id, membershipId, user);
  }

  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lista los miembros de un grupo (owner, un miembro ACTIVO, o ADMIN)',
    description: 'El owner ve a todos (incluye pendientes de pago); un miembro ACTIVO solo ve a los demás ya ACTIVE.',
  })
  @ApiResponse({ status: 200, type: [MembershipResponseDto] })
  @ApiResponse({ status: 403, description: 'No eres el owner ni un miembro activo de este grupo.' })
  async findMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MembershipResponseDto[]> {
    const members = await this.groupsService.findMembers(id, user);
    return members.map((m) => new MembershipResponseDto(m));
  }

  @Put(':id/credential')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crea o actualiza la credencial de la cuenta compartida (solo el owner)',
    description:
      'Se cifra (AES-256-GCM) antes de guardarse. Cada cambio queda auditado en el historial (quién y cuándo, ' +
      'no el valor anterior).',
  })
  @ApiResponse({ status: 200, type: CredentialResponseDto })
  @ApiResponse({ status: 403, description: 'No eres el owner de este grupo.' })
  async upsertCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCredentialDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CredentialResponseDto> {
    return this.groupsService.upsertCredential(id, dto, user);
  }

  @Get(':id/credential')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ve la credencial descifrada de la cuenta compartida (owner o miembro ACTIVE)',
    description:
      'Ni un ADMIN de la plataforma puede ver esto si no es owner o miembro activo del grupo — es información ' +
      'privada del grupo, no una herramienta de soporte.',
  })
  @ApiResponse({ status: 200, type: CredentialResponseDto })
  @ApiResponse({ status: 403, description: 'No eres el owner ni un miembro activo de este grupo.' })
  @ApiResponse({ status: 404, description: 'Este grupo todavía no tiene una credencial configurada.' })
  async getCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CredentialResponseDto> {
    return this.groupsService.getCredential(id, user);
  }

  @Get(':id/credential-history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historial de cambios de la credencial (owner o miembro ACTIVE)' })
  @ApiResponse({ status: 200, type: [CredentialHistoryResponseDto] })
  @ApiResponse({ status: 403, description: 'No eres el owner ni un miembro activo de este grupo.' })
  async getCredentialHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CredentialHistoryResponseDto[]> {
    const history = await this.groupsService.getCredentialHistory(id, user);
    return history.map((h) => new CredentialHistoryResponseDto(h));
  }

  @Get(':id/profiles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista los perfiles de la cuenta compartida y a quién está asignado cada uno (owner o ADMIN)' })
  @ApiResponse({ status: 200, type: [GroupProfileResponseDto] })
  async findProfiles(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<GroupProfileResponseDto[]> {
    return this.groupsService.findProfiles(id, user);
  }

  @Post(':id/profiles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agrega un perfil extra a la cuenta compartida (solo el owner)' })
  @ApiResponse({ status: 201, type: GroupProfileResponseDto })
  async createProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertGroupProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GroupProfileResponseDto> {
    return this.groupsService.createProfile(id, dto, user);
  }

  @Put(':id/profiles/:profileId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renombra un perfil de la cuenta compartida (solo el owner)' })
  @ApiResponse({ status: 200, type: GroupProfileResponseDto })
  async renameProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: UpsertGroupProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GroupProfileResponseDto> {
    return this.groupsService.renameProfile(id, profileId, dto, user);
  }

  @Delete(':id/profiles/:profileId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borra un perfil sin asignar de la cuenta compartida (solo el owner)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'El perfil está asignado a un miembro.' })
  async deleteProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.groupsService.deleteProfile(id, profileId, user);
  }
}
