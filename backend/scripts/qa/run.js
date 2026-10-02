/*
 * Pruebas de extremo a extremo de Tequio (cobros, renovaciones, reseñas, comisiones y seguridad).
 * Uso (desde backend/, con la API corriendo y `npm run build` al día):
 *   node scripts/qa/run.js              → todas
 *   node scripts/qa/run.js renovacion   → solo algunas (renovacion, entrada, resenas, seguridad, comision)
 * Crea grupos temporales y al final deja la base como estaba. Sale con código 1 si alguna verificación falla.
 */
const { prisma, createRun, cleanup } = require('./lib');

const SUITES = ['renovacion', 'entrada', 'resenas', 'comision', 'seguridad', 'apartados', 'credenciales', 'soporte', 'acceso'];

(async () => {
  const requested = process.argv.slice(2);
  const unknown = requested.filter((s) => !SUITES.includes(s));
  if (unknown.length) {
    console.error(`No existe la prueba: ${unknown.join(', ')}. Opciones: ${SUITES.join(', ')}.`);
    process.exit(2);
  }
  const names = requested.length ? requested : SUITES;

  let run;
  try {
    run = await createRun();
  } catch (error) {
    console.error(`No se pudo preparar la corrida: ${error.message}`);
    await prisma.$disconnect();
    process.exit(2);
  }

  const results = [];
  const suites = names.map((name) => ({ name, ...require(`./suites/${name}`) }));
  try {
    for (const suite of suites) {
      console.log(`\n=== ${suite.title} ===`);
      const failuresBefore = run.failures, checksBefore = run.checks;
      try {
        if (suite.before) await suite.before(run);
        await suite.run(run);
      } catch (error) {
        run.failures += 1;
        console.log(`  ✘ error inesperado: ${error.message}`);
      }
      results.push({ title: suite.title, checks: run.checks - checksBefore, failed: run.failures - failuresBefore });
    }
  } finally {
    const removed = await cleanup(run);
    for (const suite of suites) if (suite.after) await suite.after(run).catch(() => {});
    await run.nest.close();
    await prisma.$disconnect();
    console.log(`\nLimpieza: ${removed} grupo(s) de prueba borrado(s) con sus pagos, comprobantes, avisos y correos.`);
  }

  console.log('\nResumen');
  for (const r of results) console.log(`  ${r.failed ? '✘' : '✔'} ${r.title}: ${r.checks - r.failed}/${r.checks}`);
  console.log(run.failures === 0 ? '\nTODO OK' : `\n${run.failures} verificación(es) fallaron`);
  process.exit(run.failures === 0 ? 0 : 1);
})();
