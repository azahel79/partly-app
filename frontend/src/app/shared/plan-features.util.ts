export interface PlanFeature {
  icon: string;
  label: string;
}

/**
 * Características típicas inferidas del nombre del plan/tier — igual que platform-logo.util
 * infiere el logo real de una marca conocida. No son datos capturados por el vendedor (el
 * modelo Plan no tiene ese campo todavía), así que es un "mejor esfuerzo" honesto basado en
 * convenciones reales de la industria (ej. un tier "Premium" de streaming típicamente trae
 * 4K y multi-dispositivo). Si el tier no coincide con nada conocido, no se muestra nada en
 * vez de inventar.
 */
/** Nombres de tier genéricos/placeholder que no describen nada real — nunca inferir de estos. */
const GENERIC_TIER_NAMES = ['personalizado', 'prueba', 'custom', 'test', 'default'];

export function planFeatures(tierName: string): PlanFeature[] {
  const key = tierName.toLowerCase().trim();

  if (GENERIC_TIER_NAMES.includes(key)) {
    return [];
  }

  if (key.includes('premium') || key.includes('4k') || key.includes('uhd') || key.includes('ultra')) {
    return [
      { icon: 'hd', label: '4K / HDR' },
      { icon: 'devices', label: 'Multi-dispositivo' },
      { icon: 'block', label: 'Sin anuncios' },
    ];
  }
  if (key.includes('familiar') || key.includes('family')) {
    return [
      { icon: 'block', label: 'Sin anuncios' },
      { icon: 'download', label: 'Descargas offline' },
      { icon: 'groups', label: 'Varias cuentas' },
    ];
  }
  if (key.includes('estándar') || key.includes('estandar') || key.includes('standard')) {
    return [
      { icon: 'hd', label: 'HD' },
      { icon: 'devices', label: 'Multi-dispositivo' },
    ];
  }
  if (key.includes('con anuncios') || key.includes('ads') || key.includes('básico') || key.includes('basico')) {
    return [
      { icon: 'campaign', label: 'Con anuncios' },
      { icon: 'hd', label: 'HD' },
    ];
  }
  if (key.includes('individual') || /\bpersonal\b/.test(key)) {
    return [
      { icon: 'block', label: 'Sin anuncios' },
      { icon: 'download', label: 'Descargas offline' },
    ];
  }
  if (key.includes('pro') || key.includes('equipo') || key.includes('team')) {
    return [
      { icon: 'devices', label: 'Multi-dispositivo' },
      { icon: 'support_agent', label: 'Soporte prioritario' },
    ];
  }
  return [];
}
