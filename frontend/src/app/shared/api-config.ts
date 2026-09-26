import { isDevMode } from '@angular/core';

/**
 * En desarrollo el backend Nest corre aparte (ng serve en :4200, Nest en :3000).
 * En producción se asume que la API queda publicada bajo el mismo origen que el
 * frontend, en /api (por ejemplo detrás de un mismo dominio o reverse proxy) —
 * ajusta esto si el backend termina viviendo en un dominio distinto.
 */



export const API_BASE_URL = isDevMode() ? 'http://localhost:3001/api' : '/api';
