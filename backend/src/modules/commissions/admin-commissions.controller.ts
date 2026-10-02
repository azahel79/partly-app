import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CommissionsService } from './commissions.service';
import { ListAdminCommissionsQueryDto } from './dto/list-admin-commissions-query.dto';
import { ReviewCommissionDto } from './dto/review-commission.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

@ApiTags('admin')
@Controller('admin/commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminCommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Cobros de comisión de todos los vendedores (cola de revisión)' })
  findAll(@Query() query: ListAdminCommissionsQueryDto) {
    return this.commissionsService.findAllCharges(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totales: por cobrar, en revisión, vencido y cobrado este mes' })
  getSummary() {
    return this.commissionsService.getAdminSummary();
  }

  @Get('bank-account')
  @ApiOperation({ summary: 'Cuenta bancaria de Tequio donde los vendedores transfieren la comisión' })
  getBankAccount() {
    return this.commissionsService.getBankAccount();
  }

  @Put('bank-account')
  @ApiOperation({ summary: 'Configura la cuenta bancaria de Tequio' })
  updateBankAccount(@Body() dto: UpdateBankAccountDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.commissionsService.updateBankAccount(dto, admin);
  }

  @Post(':id/remind')
  @ApiOperation({ summary: 'Envía al vendedor un recordatorio (app + correo) de su comisión por pagar. Máximo uno al día.' })
  remind(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.commissionsService.sendManualReminder(id, admin);
  }

  @Put(':id/review')
  @ApiOperation({ summary: 'Aprueba (la transferencia llegó) o rechaza el comprobante de una comisión' })
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewCommissionDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.commissionsService.review(id, dto, admin);
  }
}
