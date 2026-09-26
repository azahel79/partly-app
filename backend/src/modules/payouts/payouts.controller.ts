import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { PayoutsService } from './payouts.service';
import { UpdatePayoutStatusDto } from './dto/update-payout-status.dto';
import { PayoutRequestResponseDto } from './dto/payout-request-response.dto';
import { ListPayoutsQueryDto } from './dto/list-payouts-query.dto';
import { PaginatedPayoutsResponseDto } from './dto/paginated-payouts-response.dto';

@ApiTags('payouts')
@Controller('payouts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Tus retiros anteriores (solo historial: los retiros ya no se solicitan desde la app)' })
  @ApiResponse({ status: 200, type: PaginatedPayoutsResponseDto })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPayoutsQueryDto,
  ): Promise<PaginatedPayoutsResponseDto> {
    const { data, total } = await this.payoutsService.findMine(user.id, query);
    return {
      data: data.map((p) => new PayoutRequestResponseDto(p)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lista todas las solicitudes de retiro (solo ADMIN, cola de procesamiento)' })
  @ApiResponse({ status: 200, type: PaginatedPayoutsResponseDto })
  async findAll(@Query() query: ListPayoutsQueryDto): Promise<PaginatedPayoutsResponseDto> {
    const { data, total } = await this.payoutsService.findAll(query);
    return {
      data: data.map((p) => new PayoutRequestResponseDto(p)),
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
    summary: 'Cambia el estado de una solicitud de retiro (solo ADMIN)',
    description: 'PENDING → PROCESSING → PAID, o a FAILED en cualquier punto antes de PAID (reembolsa el wallet).',
  })
  @ApiResponse({ status: 200, type: PayoutRequestResponseDto })
  @ApiResponse({ status: 400, description: 'Transición de estado inválida.' })
  @ApiResponse({ status: 404, description: 'No existe.' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayoutStatusDto,
  ): Promise<PayoutRequestResponseDto> {
    const payout = await this.payoutsService.updateStatus(id, dto.status);
    return new PayoutRequestResponseDto(payout);
  }
}
