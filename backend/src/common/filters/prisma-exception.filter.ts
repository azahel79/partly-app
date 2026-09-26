import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

// Postgres codes que, cuando la base de datos los aplica directamente (no el motor de
// query de Prisma), no llegan tipados como P2002/P2003 — llegan como
// PrismaClientUnknownRequestError con el mensaje crudo de Postgres adentro:
// 23503 (foreign_key_violation), 23001 (restrict_violation), 23505 (unique_violation,
// ej. el índice único parcial de group_memberships que no es un @@unique de Prisma).
const CONFLICT_VIOLATION_CODES = ['23503', '23001', '23505'];

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      const isConflict = CONFLICT_VIOLATION_CODES.some((code) => exception.message.includes(code));
      if (isConflict) {
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'No se puede completar la operación: ya existe un registro en conflicto o hay dependencias relacionadas.',
        });
        return;
      }
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error inesperado en la base de datos.',
      });
      return;
    }

    switch (exception.code) {
      case 'P2002':
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: `Ya existe un registro con ese valor único (${(exception.meta?.target as string[])?.join(', ')}).`,
        });
        return;
      case 'P2025':
        response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'El recurso solicitado no existe.',
        });
        return;
      case 'P2003':
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'No se puede completar la operación porque hay registros relacionados que dependen de este.',
        });
        return;
      default:
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error inesperado en la base de datos.',
        });
    }
  }
}
