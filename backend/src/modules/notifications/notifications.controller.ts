import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { NotificationsService } from './notifications.service';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { PaginatedNotificationsResponseDto } from './dto/paginated-notifications-response.dto';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Tus notificaciones (avisos de pago, membresías canceladas, etc.)' })
  @ApiResponse({ status: 200, type: PaginatedNotificationsResponseDto })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<PaginatedNotificationsResponseDto> {
    const { data, total, unreadCount } = await this.notificationsService.findMine(user.id, query);
    return {
      data: data.map((n) => new NotificationResponseDto(n)),
      total,
      unreadCount,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Marca una notificación como leída' })
  @ApiResponse({ status: 200, type: NotificationResponseDto })
  @ApiResponse({ status: 404, description: 'No existe, o no es tuya.' })
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationsService.markRead(id, user.id);
    return new NotificationResponseDto(notification);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca todas tus notificaciones como leídas' })
  @ApiResponse({ status: 200, schema: { example: { updated: 3 } } })
  markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<{ updated: number }> {
    return this.notificationsService.markAllRead(user.id);
  }
}
