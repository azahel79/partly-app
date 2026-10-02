import { Group } from './groups.models';

/** Etiqueta de estado: texto + clase de color (`ui-pill--*` en app-ui.css). */
export interface StatusTag {
  label: string;
  tone: 'ui-pill--ok' | 'ui-pill--warn' | 'ui-pill--info' | 'ui-pill--danger' | 'ui-pill--violet' | '';
}

/**
 * Estado de un grupo visto por su vendedor. Colores: verde = en orden,
 * ámbar = le toca hacer algo, azul = esperando a Tequio, rojo = rechazado.
 */
export function ownerGroupStatus(group: Group): StatusTag {
  if (group.approvalStatus === 'PENDING') return { label: 'En revisión de Tequio', tone: 'ui-pill--info' };
  if (group.approvalStatus === 'REJECTED') return { label: 'Rechazado', tone: 'ui-pill--danger' };
  if (!group.hasCredentials) return { label: 'Falta subir acceso', tone: 'ui-pill--warn' };
  switch (group.status) {
    case 'PAUSED': return { label: 'Pausado', tone: '' };
    case 'CANCELLED': return { label: 'Cancelado', tone: '' };
    case 'FULL': return { label: 'Lleno', tone: 'ui-pill--ok' };
    case 'READY_TO_START': return { label: 'Listo para iniciar', tone: 'ui-pill--ok' };
  }
  return group.startedAt ? { label: 'Activo', tone: 'ui-pill--ok' } : { label: 'Juntando lugares', tone: 'ui-pill--info' };
}
