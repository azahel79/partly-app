---
name: prueba-renovacion
description: Corre las pruebas de extremo a extremo de Partly (renovación por adelantado, lugares por liberarse, entrada a mitad de ciclo, gracia de 48 horas, reseñas, comisión vencida, comisión del 9% y reducida, lugares apartados, cambio de contraseña cuando alguien sale y reglas de seguridad) contra la API local, con grupos temporales que se borran al terminar. Úsala siempre que se cambie algo de cobros, pagos, comprobantes, membresías, renovaciones, comisiones, reseñas o permisos, antes de hacer commit o de publicar, o cuando el usuario pida "probar", "verificar que no se rompió nada", "correr las pruebas" o "revisar la renovación", aunque no nombre la skill.
---

# Pruebas de extremo a extremo de Partly

Las pruebas unitarias (`npm test`) solo cubren funciones sueltas. Lo delicado de Partly son los flujos que cruzan días: un cobro que se genera 3 días antes del corte, un lugar que se libera al cortar, una gracia de 48 horas. Estos scripts arman grupos reales por la API, "viajan en el tiempo" moviendo solo las fechas de esos grupos, corren a mano las tareas programadas y revisan el resultado. Al final borran todo lo que crearon.

## Antes de correr

1. **Compila el backend** (`cd backend && npm run build`). Los scripts cargan los servicios desde `dist/` para ejecutar las tareas diarias; si `dist` está viejo, prueban código viejo.
2. **Arranca o reinicia la API** con esa misma compilación (`npm run start:dev` o `node dist/main`). Las pruebas hablan con la API por HTTP y con la base directamente; si la API corre una versión anterior, los resultados no cuadran.
No hacen falta cuentas: cada corrida crea las suyas (un admin, un vendedor y 4 compradores con correo `@partly-qa.test` y los avisos por correo apagados) y las borra al final. Así nunca se usan personas reales, aunque el `.env` tenga el correo real encendido.

Solo se corre contra la base de desarrollo: las tareas diarias actúan sobre toda la base (por ejemplo, generan recordatorios o cobros de comisión que ya tocaban). Si el `.env` tiene `MAIL_PROVIDER` real, esos avisos a cuentas reales sí salen por correo: avísale al usuario antes de correr. Los scripts se niegan si el `.env` es de producción.

## Correr

Desde `backend/`:

```bash
node scripts/qa/run.js                 # todas (tarda unos minutos)
node scripts/qa/run.js renovacion      # una o varias: renovacion, entrada, resenas, comision, seguridad, apartados, credenciales
```

Elige las pruebas según lo que cambió, para no esperar de más:

| Cambio | Pruebas |
|---|---|
| Cobros, renovaciones, lugares por liberarse, `processDailyBilling`, `seats.util` | `renovacion entrada` |
| Precio al entrar a mitad de ciclo, `billing.util`, gracia o comprobantes | `entrada` |
| Reseñas o su recordatorio | `resenas` |
| Comisiones, restricciones del vendedor | `comision` |
| Permisos, datos privados, credenciales, validación de archivos | `seguridad` |
| Comisión fija o reducida, apartar/soltar lugares, aviso de misma plataforma | `apartados` |
| Salidas del grupo y cambio de contraseña (avisos al vendedor y a los miembros) | `credenciales` |
| Antes de un commit grande o de publicar | todas |

Corre el comando en segundo plano si tu entorno lo permite y espera a que termine; imprime cada verificación con ✔/✘ y un resumen.

## Reportar

Responde en español y sin jerga. Da primero el resultado global ("pasaron las 5 pruebas, 70 verificaciones") y luego, si algo falló, cada verificación fallida con lo que significa para el negocio (por ejemplo: "a quien apagó la renovación sí se le generó cobro: se le cobraría un mes que no quiere"). Si el script terminó con "error inesperado", distingue entre un fallo de la app y un problema del entorno (API apagada, `dist` viejo, cuenta de prueba inexistente) y di cómo arreglarlo.

Si una prueba falla por un cambio intencional de las reglas de negocio, actualiza la prueba en `backend/scripts/qa/suites/` en vez de "arreglar" la app, y menciónalo.

## Si algo quedó a medias

Si la corrida se interrumpió, puede haber grupos de prueba sueltos (su plan empieza con `QA `) y cuentas `@partly-qa.test`. Límpialos con:

```bash
node scripts/qa/limpiar.js
```

## Agregar una prueba nueva

Cada archivo de `backend/scripts/qa/suites/` exporta `{ title, run(run) }` (y opcionalmente `before`/`after`). Usa las utilidades de `lib.js`:

- `buildGroup(run, { name, price, slots, members })`: grupo aprobado, iniciado y con los miembros ya pagados. `createApprovedGroup` lo deja aprobado y sin miembros.
- `setCycleEndIn(groupId, ms)` y `travel(groupId, ms)`: mueven el calendario de ese grupo (negativo = el corte ya pasó).
- `run.services.payments().processDailyBilling()`, `commissions().processDaily()`, `reviews().sendReviewReminders()`: tareas programadas a mano.
- `call(method, ruta, token, body)`, `receipt(groupId, token, contenido?, tipo?)`, `token(usuario)`.
- `run.check(etiqueta, condición, detalle)` para cada verificación y `run.track(groupId)` para cualquier grupo creado a mano (así se limpia).

Agrega el nombre a `SUITES` en `run.js`. Las etiquetas se escriben en español y describen la regla de negocio que se verifica, no el detalle técnico.
