import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Para rutas públicas que muestran más o menos según quién mira (ej. el detalle de un grupo). Sin token la
 * petición pasa como anónima; con un token presente pero inválido o vencido responde 401 igual que JwtAuthGuard,
 * así el frontend lo renueva en vez de recibir en silencio la vista pública.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
    if (!request.headers?.authorization) {
      return true;
    }
    return (await super.canActivate(context)) as boolean;
  }
}
