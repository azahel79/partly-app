import { HttpErrorResponse } from '@angular/common/http';

export function toErrorMessage(error: HttpErrorResponse): string {
  // Sin respuesta del servidor (caído, sin internet o bloqueado): el navegador manda su propio texto en inglés
  // ("Failed to fetch"), que no le sirve a nadie.
  if (error.status === 0) {
    return 'No pudimos conectar con Partly. Revisa tu conexión y vuelve a intentarlo en un momento.';
  }
  if (error.status === 429) {
    return 'Hiciste muchas acciones seguidas. Espera un minuto y vuelve a intentarlo.';
  }
  const backendMessage = error.error?.message;
  if (Array.isArray(backendMessage) && backendMessage.length > 0) {
    return backendMessage[0];
  }
  if (typeof backendMessage === 'string') {
    return backendMessage;
  }
  return 'Algo salió mal. Intenta de nuevo en un momento.';
}
