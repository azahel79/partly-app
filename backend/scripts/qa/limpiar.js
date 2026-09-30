/*
 * Borra restos de pruebas interrumpidas (por ejemplo, si se cortó la terminal a la mitad): todos los grupos cuyo plan
 * empieza con "QA " y los cobros de comisión pendientes que quedaron sin ninguna entrada.
 * Uso (desde backend/): node scripts/qa/limpiar.js
 */
const { prisma, QA_PREFIX, deleteGroup, deleteQaUsers, strayQaUserIds, unmuteRealAdmins, ENV } = require('./lib');

(async () => {
  if (ENV.NODE_ENV === 'production') {
    console.error('El .env es de producción: no se limpia nada.');
    process.exit(2);
  }
  const groups = await prisma.group.findMany({ where: { plan: { tierName: { startsWith: QA_PREFIX } } }, select: { id: true } });
  for (const g of groups) await deleteGroup(g.id);
  const orphans = await prisma.commissionCharge.deleteMany({ where: { status: 'PENDING', entries: { none: {} } } });
  const strayUsers = await strayQaUserIds();
  await deleteQaUsers(strayUsers);
  const unmuted = await unmuteRealAdmins();
  if (unmuted) console.log(`Se les devolvieron los correos a ${unmuted} admin(s) que una corrida cortada dejó silenciados.`);
  console.log(`Grupos de prueba borrados: ${groups.length}. Cobros de comisión vacíos borrados: ${orphans.count}. Cuentas de prueba borradas: ${strayUsers.length}.`);
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error.message);
  await prisma.$disconnect();
  process.exit(1);
});
