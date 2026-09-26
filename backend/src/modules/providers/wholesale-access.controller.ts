import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ListWholesaleAccessQueryDto } from './dto/list-wholesale-access-query.dto';
import { ReviewWholesaleAccessDto } from './dto/review-wholesale-access.dto';
import { WholesaleAccessService } from './wholesale-access.service';

/** Lo que ve el vendedor: qué le falta para comprar al mayoreo y el botón para pedir acceso. */
@ApiTags('wholesale-access')
@Controller('wholesale-access')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WholesaleAccessController {
  constructor(private readonly wholesaleAccessService: WholesaleAccessService) {}

  @Get('me')
  @ApiOperation({ summary: 'Tu acceso al mayoreo: estado, requisitos de reputación con su avance y tope mensual' })
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.wholesaleAccessService.getMine(user.id);
  }

  @Post('request')
  @ApiOperation({ summary: 'Pide acceso al mayoreo (solo si cumples todos los requisitos)' })
  request(@CurrentUser() user: AuthenticatedUser) {
    return this.wholesaleAccessService.request(user.id);
  }
}

@ApiTags('admin')
@Controller('admin/wholesale-access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminWholesaleAccessController {
  constructor(private readonly wholesaleAccessService: WholesaleAccessService) {}

  @Get()
  @ApiOperation({ summary: 'Solicitudes de acceso al mayoreo (o busca a cualquier vendedor) con su reputación' })
  findAll(@Query() query: ListWholesaleAccessQueryDto) {
    return this.wholesaleAccessService.findAll(query);
  }

  @Put(':userId')
  @ApiOperation({ summary: 'Autoriza (con tope mensual opcional), rechaza o retira el acceso de un vendedor' })
  review(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: ReviewWholesaleAccessDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.wholesaleAccessService.review(userId, dto, admin);
  }
}
