import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { PaymentsService } from './payments.service';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { ListPendingPaymentsQueryDto } from './dto/list-pending-payments-query.dto';
import { PaginatedPendingPaymentsResponseDto } from './dto/paginated-pending-payments-response.dto';
import { PendingPaymentResponseDto } from './dto/pending-payment-response.dto';
import { ReviewPaymentReceiptDto } from './dto/review-payment-receipt.dto';

const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

@ApiTags('groups')
@Controller('groups')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':id/payments/receipt')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_RECEIPT_SIZE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Sube tu comprobante de pago (captura o PDF) para tu ciclo actual en este grupo',
    description:
      'El pago se queda PENDING hasta que el owner del grupo lo revise contra su cuenta y lo marque como pagado ' +
      '(POST .../review). Acepta JPG, PNG, WEBP o PDF, hasta 8MB.',
  })
  @ApiResponse({ status: 201, type: PaymentResponseDto })
  @ApiResponse({ status: 404, description: 'No tienes membresía activa, o no hay ningún pago pendiente.' })
  async uploadReceipt(
    @Param('id', ParseUUIDPipe) groupId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    if (!file) {
      throw new BadRequestException('Falta el archivo del comprobante (campo "file").');
    }
    return this.paymentsService.uploadReceipt(groupId, user.id, file);
  }

  @Get(':id/payments/mine')
  @ApiOperation({ summary: 'Tu propio pago pendiente en este grupo (monto a transferir y estado del comprobante)' })
  @ApiResponse({ status: 200, type: PaymentResponseDto })
  @ApiResponse({ status: 404, description: 'No tienes membresía activa o pendiente en este grupo.' })
  async findMine(@Param('id', ParseUUIDPipe) groupId: string, @CurrentUser() user: AuthenticatedUser): Promise<PaymentResponseDto | null> {
    return this.paymentsService.findMine(groupId, user.id);
  }

  @Get(':id/payments/pending')
  @ApiOperation({ summary: 'Cola de pagos pendientes de revisar en este grupo (solo el owner, o ADMIN)' })
  @ApiResponse({ status: 200, type: PaginatedPendingPaymentsResponseDto })
  @ApiResponse({ status: 403, description: 'No eres el owner de este grupo.' })
  async findPending(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Query() query: ListPendingPaymentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedPendingPaymentsResponseDto> {
    const { data, total } = await this.paymentsService.findPending(groupId, user, query);
    return {
      data: data.map((p) => new PendingPaymentResponseDto(p)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Put(':id/payments/:paymentId/review')
  @ApiOperation({
    summary: 'Aprueba o rechaza el comprobante de un pago pendiente (solo el vendedor)',
    description: 'Aprobar acredita tu wallet (menos la comisión del plan), igual que antes. Rechazar borra el comprobante y avisa al miembro para que suba uno nuevo.',
  })
  @ApiResponse({ status: 200, type: PaymentResponseDto })
  @ApiResponse({ status: 400, description: 'El pago ya fue revisado, o no tiene comprobante subido.' })
  async review(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ReviewPaymentReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.reviewReceipt(groupId, paymentId, dto, user);
  }

  @Get(':id/payments/:paymentId/receipt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descarga el comprobante subido para ese pago (owner, quien pagó, o ADMIN)' })
  @ApiResponse({ status: 200, description: 'El archivo del comprobante (imagen o PDF).' })
  @ApiResponse({ status: 404, description: 'Este pago todavía no tiene un comprobante subido.' })
  async getReceipt(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const { absolutePath, filename } = await this.paymentsService.getReceiptFilePath(groupId, paymentId, user);
    res.sendFile(absolutePath, { headers: { 'Content-Disposition': `inline; filename="${filename}"` } });
  }
}
