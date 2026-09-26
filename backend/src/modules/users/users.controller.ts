import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { CancelAccountDto } from './dto/cancel-account.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lista usuarios con filtros y paginación (solo ADMIN)',
    description: 'Filtra por rol, método de login (LOCAL/GOOGLE) y búsqueda parcial por nombre o correo.',
  })
  @ApiResponse({ status: 200, type: PaginatedUsersResponseDto })
  @ApiResponse({ status: 403, description: 'El usuario autenticado no tiene rol ADMIN.' })
  async findAll(@Query() query: ListUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    const { data, total } = await this.usersService.findMany(query);
    return {
      data: data.map((user) => new UserResponseDto(user)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Put(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Asigna un rol (USER/ADMIN) a otro usuario (solo ADMIN)',
    description:
      'Un ADMIN no puede quitarse su propio rol de administrador, ni degradar al último ADMIN activo del ' +
      'sistema — evita quedarse sin nadie con acceso administrativo. Cada cambio queda auditado en admin_action_logs.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Cuenta cancelada, auto-degradación, o degradar al último ADMIN.' })
  @ApiResponse({ status: 403, description: 'El usuario autenticado no tiene rol ADMIN.' })
  @ApiResponse({ status: 404, description: 'El usuario objetivo no existe.' })
  async updateRole(
    @Param('id', ParseUUIDPipe) targetUserId: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateRole(targetUserId, dto.role, currentUser.id);
    return new UserResponseDto(user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil del usuario autenticado (Derecho ARCO: Acceso)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getProfile(@CurrentUser() currentUser: AuthenticatedUser): Promise<UserResponseDto> {
    const user = await this.usersService.findById(currentUser.id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    return new UserResponseDto(user);
  }

  @Get('me/payout-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tu cuenta de abono guardada, descifrada (solo tú) — para autocompletar la CLABE al crear un grupo' })
  async getPayoutAccount(@CurrentUser() currentUser: AuthenticatedUser): Promise<{ holder: string; bankName: string; clabe: string } | null> {
    return (await this.usersService.getPayoutAccount(currentUser.id)) ?? null;
  }

  @Get('me/trust-summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resumen de confianza y actividad del perfil autenticado' })
  getTrustSummary(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.usersService.getTrustSummary(currentUser.id);
  }

  @Get('me/sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista las sesiones activas de la cuenta' })
  getSessions(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.usersService.findActiveSessions(currentUser.id);
  }

  @Delete('me/sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cierra una sesión específica de la cuenta' })
  revokeSession(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    return this.usersService.revokeSession(currentUser.id, sessionId);
  }

  @Get('me/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exporta los datos personales y de actividad del usuario' })
  exportData(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.usersService.exportUserData(currentUser.id);
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Actualiza el perfil propio y contraseña (Derecho ARCO: Rectificación / Oposición)',
    description:
      'Para cambiar la contraseña envía currentPassword + newPassword. Solo aplica a cuentas locales; ' +
      'las cuentas de Google no tienen contraseña que cambiar. marketingOptOut es el mecanismo de ' +
      'Oposición: al ponerlo en true, dejas de recibir comunicaciones no esenciales.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Falta currentPassword, o la cuenta es de Google.' })
  @ApiResponse({ status: 401, description: 'currentPassword no coincide.' })
  async updateProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateProfile(currentUser.id, dto);
    return new UserResponseDto(user);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancela tu cuenta (Derecho ARCO: Cancelación)',
    description:
      'Anonimiza tus datos personales (nombre, correo, teléfono, avatar, contraseña) y revoca todas tus ' +
      'sesiones activas. El registro no se borra físicamente para no romper la integridad de historial que ' +
      'deba conservarse (pagos, grupos), pero deja de estar asociado a tu identidad real; ya no podrás ' +
      'loguearte con estas credenciales.',
  })
  @ApiResponse({ status: 204, description: 'Cuenta cancelada y anonimizada.' })
  async cancelAccount(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CancelAccountDto,
  ): Promise<void> {
    await this.usersService.cancelAccount(currentUser.id, dto.currentPassword);
  }
}
