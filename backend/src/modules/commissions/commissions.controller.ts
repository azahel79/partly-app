import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CommissionsService } from './commissions.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';

const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

/** Ganancias del vendedor: lo que cobra de sus grupos, ya separado en comisión de Tequio y lo que le queda. */
@ApiTags('earnings')
@Controller('earnings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EarningsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Tus ganancias: totales, del mes, comisión y lo que te queda por grupo' })
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.commissionsService.getEarningsSummary(user.id);
  }

  @Get('entries')
  @ApiOperation({ summary: 'Historial de pagos validados: bruto, comisión y neto de cada uno' })
  getEntries(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.commissionsService.findEarningEntries(user.id, query);
  }
}

/** Comisión que el vendedor le paga a Tequio por transferencia (con comprobante). */
@ApiTags('commissions')
@Controller('commissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Resumen rápido para el aviso del panel: cuánto debes y si estás restringido' })
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.commissionsService.getStatus(user.id);
  }

  @Get('me')
  @ApiOperation({ summary: 'Tus cobros de comisión, la cuenta de Tequio donde pagarlos y tu estado' })
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.commissionsService.getMyCommissions(user.id);
  }

  @Get('bank-account')
  @ApiOperation({ summary: 'Cuenta bancaria de Tequio para transferir la comisión' })
  getBankAccount() {
    return this.commissionsService.getBankAccount();
  }

  @Post(':id/receipt')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_RECEIPT_SIZE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube el comprobante de tu transferencia de comisión; queda en revisión de Tequio' })
  uploadReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Falta el archivo del comprobante (campo "file").');
    }
    return this.commissionsService.uploadReceipt(id, user.id, file);
  }

  @Get(':id/receipt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descarga el comprobante de una comisión (el vendedor o un ADMIN)' })
  async getReceipt(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const { absolutePath, filename } = await this.commissionsService.getReceiptFilePath(id, user);
    res.sendFile(absolutePath, { headers: { 'Content-Disposition': `inline; filename="${filename}"` } });
  }
}
