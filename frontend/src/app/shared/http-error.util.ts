import { HttpErrorResponse } from '@angular/common/http';

export function toErrorMessage(error: HttpErrorResponse): string {
  const backendMessage = error.error?.message;
  if (Array.isArray(backendMessage) && backendMessage.length > 0) {
    return backendMessage[0];
  }
  if (typeof backendMessage === 'string') {
    return backendMessage;
  }
  return 'Algo salió mal. Intenta de nuevo en un momento.';
}
