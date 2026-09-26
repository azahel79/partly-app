import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ListAdminPaymentsQueryDto } from './dto/list-admin-payments-query.dto';
import { PaymentsService } from './payments.service';

@ApiTags('admin-payments')
@Controller('admin/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Supervisión de pagos y comprobantes para staff',
    description: 'Vista de solo lectura. El administrador puede comprobar si el archivo existe, pero únicamente el vendedor activa al miembro.',
  })
  findAll(@Query() query: ListAdminPaymentsQueryDto) {
    return this.paymentsService.findAllForAdmin(query);
  }

  @Post(':paymentId/remind')
  @ApiOperation({
    summary: 'Envía un recordatorio (app + correo) sobre un pago pendiente',
    description: 'Sin comprobante: se lo recuerda al comprador. Con comprobante subido: se lo recuerda al vendedor que debe revisarlo. Máximo uno por persona al día.',
  })
  remind(@Param('paymentId', ParseUUIDPipe) paymentId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.paymentsService.sendManualReminder(paymentId, admin);
  }
}
