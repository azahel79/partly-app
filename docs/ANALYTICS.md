# AnalÃ­tica pÃºblica de Tequio

La landing ya emite eventos de conversiÃ³n y Web Vitals mediante una capa neutral. El cÃ³digo no instala un proveedor, no crea cookies y no envÃ­a datos por sÃ­ solo. Antes de conectar GA4, Matomo u otra herramienta, deben aprobarse el proveedor, la polÃ­tica de privacidad, el mecanismo de consentimiento y la retenciÃ³n.

## IntegraciÃ³n

`LandingAnalyticsService` sigue este orden:

1. usa `window.gtag` si producciÃ³n ya lo instalÃ³;
2. en caso contrario agrega el evento a `window.dataLayer`;
3. siempre publica `partly:analytics` en `window` para adaptadores propios y QA.

Cada evento incluye `page_path`. No se deben agregar correos, nombres, identificadores de usuario, CLABE, credenciales, comprobantes ni texto libre.

Si el proveedor requiere scripts o conexiones externas, usa un archivo versionado dentro de `frontend/public/`, cÃ¡rgalo solo despuÃ©s del consentimiento cuando corresponda y actualiza la CSP de `frontend/nginx/security-headers.conf` con el dominio mÃ­nimo necesario.

## Eventos actuales

| Evento | CuÃ¡ndo ocurre | ParÃ¡metros principales |
|---|---|---|
| `public_page_view` | cambia una ruta pÃºblica | `route` |
| `public_nav_auth_clicked` | login o registro desde el encabezado | `target` |
| `landing_audience_selected` | cambia entre comprador y titular | `audience` |
| `landing_calculator_plan_selected` | selecciona un plan | `platform`, `tier` |
| `landing_calculator_people_changed` | ajusta personas del cÃ¡lculo | `people` |
| `payment_journey_stage_viewed` | cambia el paso del flujo demostrativo | `stage` |
| eventos `*_cta_clicked` y `*_link_clicked` | CTAs y enlaces contextuales instrumentados | `placement`, `destination` u otros datos no personales |
| `web_vital` | al abandonar la pÃ¡gina | `metric`, `value` |

Los valores de `web_vital` usan milisegundos para LCP e INP y valor decimal para CLS.

## ValidaciÃ³n previa al lanzamiento

- elegir y documentar el proveedor y su responsable;
- bloquearlo hasta el consentimiento si la evaluaciÃ³n legal lo exige;
- probar los eventos en un entorno de ensayo;
- verificar que ningÃºn parÃ¡metro incluya informaciÃ³n personal;
- acordar nombres de conversiÃ³n, retenciÃ³n, acceso y eliminaciÃ³n;
- crear un tablero para visita â†’ CTA â†’ registro completado sin identificar personas en la landing;
- revisar Web Vitals por dispositivo y ruta, no solo el promedio global.

La conversiÃ³n de registro completado debe emitirse desde el flujo de autenticaciÃ³n despuÃ©s de una confirmaciÃ³n real; no debe inferirse solo por visitar `/crear-cuenta`.
