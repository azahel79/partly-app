import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CommissionRatesService } from './commission-rates.service';
import { ListRateRequestsQueryDto } from './dto/list-rate-requests-query.dto';
import { RequestRateDto } from './dto/request-rate.dto';
import { ReviewRateRequestDto } from './dto/review-rate-request.dto';

/** Lo que ve el vendedor: su comisión, qué le falta para pedirla más baja y el botón para pedirla. */
@ApiTags('commissions')
@Controller('commissions/rate')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommissionRateController {
  constructor(private readonly commissionRatesService: CommissionRatesService) {}

  @Get()
  @ApiOperation({ summary: 'Tu comisión vigente (9% o la reducida), requisitos para pedir una menor y tu última solicitud' })
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.commissionRatesService.getMine(user.id);
  }

  @Post('request')
  @ApiOperation({ summary: 'Pide una comisión reducida (solo si cumples los requisitos)' })
  request(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestRateDto) {
    return this.commissionRatesService.request(user.id, dto);
  }
}

@ApiTags('admin')
@Controller('admin/commission-rate-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminCommissionRateController {
  constructor(private readonly commissionRatesService: CommissionRatesService) {}

  @Get()
  @ApiOperation({ summary: 'Solicitudes de comisión reducida con la reputación de cada vendedor' })
  findAll(@Query() query: ListRateRequestsQueryDto) {
    return this.commissionRatesService.findAll(query);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Autoriza un porcentaje menor (aplica a todos los grupos del vendedor) o rechaza con motivo' })
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewRateRequestDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.commissionRatesService.review(id, dto, admin);
  }
}
