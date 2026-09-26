# Vakeva Web

Aplicación Angular 22 de Vakeva. Incluye landing pública, autenticación, panel de compradores/vendedores y panel administrativo.

## Desarrollo

```bash
npm ci
npm start
```

Abre `http://localhost:4200`. La API de desarrollo está configurada en `src/app/shared/api-config.ts` como `http://localhost:3001/api`.

## Áreas

- `src/app/landing`: páginas públicas, contenido legal y explicación del producto.
- `src/app/auth`: registro, login y callback de Google OAuth.
- `src/app/panel`: grupos, pagos, ganancias, mayoreo, perfil y soporte.
- `src/app/admin`: moderación, pagos, comisiones, proveedores, usuarios y correo.
- `src/app/shared`: modelos, servicios HTTP, guards, utilidades y componentes comunes.

Las rutas usan carga diferida. `authGuard` protege `/panel` y `adminGuard` protege `/admin`.

## Calidad

```bash
npm test -- --watch=false
npm run build
```

Las pruebas se ejecutan con Vitest mediante Angular CLI. La compilación de producción aplica presupuestos de tamaño definidos en `angular.json`.

## Producción

El build usa `/api` como origen del backend. El `Dockerfile` compila la aplicación y Nginx sirve el SPA, entrega assets con caché y envía `/api/*` al servicio `backend`.

Consulta la [guía general de producción](../docs/PRODUCTION.md).
