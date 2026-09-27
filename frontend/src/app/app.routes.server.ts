import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Public marketing pages are emitted as HTML during the production build.
 * Authenticated, administrative and callback routes keep their current CSR behavior.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'como-funciona-el-ciclo', renderMode: RenderMode.Prerender },
  // This route depends on the live plan catalogue and remains client-rendered.
  { path: 'comparativa', renderMode: RenderMode.Client },
  { path: 'seguridad', renderMode: RenderMode.Prerender },
  { path: 'terminos', renderMode: RenderMode.Prerender },
  { path: 'privacidad', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
