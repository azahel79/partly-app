/*
 * Simulador de fechas para probar a mano los casos que tardan días (entrar a mitad de ciclo, renovaciones, lugares
 * que se liberan…) con grupos y cuentas reales de desarrollo. Mueve solo las fechas del grupo indicado y guarda las
 * originales para poder regresarlas.
 *
 *   node scripts/qa/simular.js estado                  grupos, miembros y cuándo es su corte
 *   node scripts/qa/simular.js dias <grupo> <N>        deja el corte del ciclo en curso a N días de hoy (N < 0: ya pasó)
 *   node scripts/qa/simular.js medianoche              corre ya la tarea de medianoche (cobros, cortes, lugares)
 *   node scripts/qa/simular.js restaurar <grupo>       regresa las fechas del grupo a como estaban antes de simular
 *   node scripts/qa/simular.js vence <grupo> <N>       la cuenta de mayoreo de ese grupo vence en N días (N < 0: ya venció)
 *   node scripts/qa/simular.js cada-hora               corre ya la tarea horaria del mayoreo (avisos de vencimiento, reservas sin pago)
 *
 * <grupo> es el inicio de su id (8 letras) o el nombre de la plataforma. Los avisos salen de verdad: con
 * MAIL_PROVIDER=smtp les llegan correos a las cuentas. Solo en desarrollo.
 */
const fs = require('fs');
const path = require('path');
const { prisma, DAY, BACKEND } = require('./lib');

const BACKUP = path.join(__dirname, '.fechas-originales.json');
const fmt = (d) => (d ? new Date(d).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) : '—');

function assertDev() {
  const env = fs.readFileSync(path.join(BACKEND, '.env'), 'utf8');
  if (/^\s*NODE_ENV\s*=\s*["']?production/m.test(env)) throw new Error('El .env es de producción: el simulador solo se usa en desarrollo.');
}

async function findGroup(key) {
  if (!key) throw new Error('Falta el grupo (inicio de su id o nombre de la plataforma).');
  const groups = await prisma.group.findMany({ where: { status: { not: 'CANCELLED' } }, include: { plan: { include: { platform: true } } } });
  const k = key.toLowerCase();
  const matches = groups.filter((g) => g.id.startsWith(k) || g.plan.platform.name.toLowerCase() === k);
  if (matches.length !== 1) throw new Error(matches.length ? `"${key}" coincide con varios grupos; usa el inicio de su id.` : `No encontré el grupo "${key}".`);
  return matches[0];
}

/**
 * Recorre las fechas del grupo `ms` hacia atrás (para el grupo, "ahora" queda más adelante). El plazo de un primer pago
 * pendiente (48 h desde que entró o desde que inició el grupo) es tiempo real y no se mueve; el de una renovación sí,
 * porque cuelga del corte.
 */
async function shift(groupId, ms) {
  const m = Math.round(ms);
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE billing_cycles SET period_start = period_start - ${m} * interval '1 millisecond', period_end = period_end - ${m} * interval '1 millisecond' WHERE group_id = ${groupId}`,
    prisma.$executeRaw`UPDATE groups SET next_renewal_date = next_renewal_date - ${m} * interval '1 millisecond', started_at = started_at - ${m} * interval '1 millisecond' WHERE id = ${groupId}`,
    prisma.$executeRaw`UPDATE group_memberships SET current_period_end = current_period_end - ${m} * interval '1 millisecond', joined_at = joined_at - ${m} * interval '1 millisecond' WHERE group_id = ${groupId}`,
    prisma.$executeRaw`UPDATE payments SET covered_from = covered_from - ${m} * interval '1 millisecond', covered_until = covered_until - ${m} * interval '1 millisecond', paid_at = paid_at - ${m} * interval '1 millisecond', receipt_uploaded_at = receipt_uploaded_at - ${m} * interval '1 millisecond' WHERE membership_id IN (SELECT id FROM group_memberships WHERE group_id = ${groupId})`,
    prisma.$executeRaw`UPDATE payments SET grace_until = grace_until - ${m} * interval '1 millisecond' WHERE membership_id IN (SELECT id FROM group_memberships WHERE group_id = ${groupId}) AND NOT (status = 'PENDING' AND for_next_cycle = false)`,
  ]);
}

function readBackup() {
  try { return JSON.parse(fs.readFileSync(BACKUP, 'utf8')); } catch { return {}; }
}

async function printState() {
  const groups = await prisma.group.findMany({
    where: { status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'asc' },
    include: {
      plan: { include: { platform: true } },
      owner: { select: { name: true } },
      billingCycles: { where: { status: 'OPEN' }, take: 1 },
      sourceProviderOrder: { select: { expiresAt: true, renewable: true } },
      memberships: { where: { status: { notIn: ['CANCELLED', 'FINISHED'] } }, include: { user: { select: { name: true } }, payments: { where: { status: 'PENDING' } } }, orderBy: { joinedAt: 'asc' } },
    },
  });
  const moved = readBackup();
  for (const g of groups) {
    const cycle = g.billingCycles[0];
    const days = cycle ? ((cycle.periodEnd.getTime() - Date.now()) / DAY).toFixed(1) : null;
    console.log(`\n${g.id.slice(0, 8)}  ${g.plan.platform.name} de ${g.owner.name}  ·  ${g.status}  ·  ${g.memberships.filter((m) => m.status !== 'RESERVED' || !g.startedAt).length}/${g.availableSlots} lugares${moved[g.id] ? '  ·  FECHAS SIMULADAS' : ''}`);
    console.log(cycle ? `  corte: ${fmt(cycle.periodEnd)} (en ${days} días)` : '  no ha iniciado');
    const src = g.sourceProviderOrder;
    if (src?.expiresAt) console.log(`  cuenta de mayoreo ${src.renewable ? 'renovable' : 'no renovable'}: vence ${fmt(src.expiresAt)} (en ${((src.expiresAt.getTime() - Date.now()) / DAY).toFixed(1)} días)`);
    for (const m of g.memberships) {
      const p = m.payments[0];
      const pay = p ? ` · pago pendiente $${p.amount}${p.receiptPath ? ' con comprobante' : ''}, plazo ${fmt(p.graceUntil)}${p.forNextCycle ? ' (renovación)' : ''}` : '';
      console.log(`  - ${m.user.name}: ${m.status}${m.status === 'ACTIVE' ? (m.autoRenew ? ' · renueva' : ' · NO renueva') : ''}${pay}`);
    }
  }
}

(async () => {
  assertDev();
  const [cmd, key, value] = process.argv.slice(2);
  try {
    if (cmd === 'estado' || !cmd) {
      await printState();
    } else if (cmd === 'dias') {
      const days = Number(value);
      if (!Number.isFinite(days)) throw new Error('Uso: dias <grupo> <N>');
      const group = await findGroup(key);
      const cycle = await prisma.billingCycle.findFirst({ where: { groupId: group.id, status: 'OPEN' }, orderBy: { periodEnd: 'desc' } });
      if (!cycle) throw new Error('Ese grupo no ha iniciado: no tiene corte que mover.');
      const backup = readBackup();
      if (!backup[group.id]) {
        backup[group.id] = { cycleId: cycle.id, periodEnd: cycle.periodEnd.toISOString(), platform: group.plan.platform.name };
        fs.writeFileSync(BACKUP, JSON.stringify(backup, null, 2));
      }
      await shift(group.id, cycle.periodEnd.getTime() - (Date.now() + days * DAY));
      console.log(`${group.plan.platform.name}: el corte quedó a ${days} días (${fmt(Date.now() + days * DAY)}).`);
      await printState();
    } else if (cmd === 'medianoche') {
      const { NestFactory } = require('@nestjs/core');
      const { AppModule } = require(path.join(BACKEND, 'dist/app.module.js'));
      const nest = await NestFactory.createApplicationContext(AppModule, { logger: false });
      const { PaymentsService } = require(path.join(BACKEND, 'dist/modules/payments/payments.service.js'));
      await nest.get(PaymentsService).processDailyBilling();
      await nest.close();
      console.log('Tarea de medianoche ejecutada (los correos salen en el siguiente minuto).');
      await printState();
    } else if (cmd === 'vence') {
      const days = Number(value);
      if (!Number.isFinite(days)) throw new Error('Uso: vence <grupo> <N>');
      const group = await findGroup(key);
      const order = await prisma.providerOrder.findUnique({ where: { resultingGroupId: group.id } });
      if (!order?.expiresAt) throw new Error('Ese grupo no viene de una cuenta de mayoreo entregada.');
      const expiresAt = new Date(Date.now() + days * DAY);
      await prisma.providerOrder.update({ where: { id: order.id }, data: { expiresAt } });
      console.log(`${group.plan.platform.name} (${order.renewable ? 'renovable' : 'no renovable'}): la cuenta vence el ${fmt(expiresAt)} (en ${days} días).`);
    } else if (cmd === 'cada-hora') {
      const { NestFactory } = require('@nestjs/core');
      const { AppModule } = require(path.join(BACKEND, 'dist/app.module.js'));
      const nest = await NestFactory.createApplicationContext(AppModule, { logger: false });
      const { ProviderOrdersService } = require(path.join(BACKEND, 'dist/modules/providers/provider-orders.service.js'));
      await nest.get(ProviderOrdersService).processHourly();
      await nest.close();
      console.log('Tarea horaria del mayoreo ejecutada (los correos salen en el siguiente minuto).');
    } else if (cmd === 'restaurar') {
      const group = await findGroup(key);
      const backup = readBackup();
      if (!backup[group.id]) throw new Error('Ese grupo no tiene fechas simuladas.');
      const cycle = await prisma.billingCycle.findFirst({ where: { groupId: group.id, status: 'OPEN' }, orderBy: { periodEnd: 'desc' } });
      // Pasado un corte simulado ya hay un ciclo nuevo y cobros generados: regresar las fechas los dejaría incoherentes.
      if (!cycle || cycle.id !== backup[group.id].cycleId) {
        throw new Error('Ese grupo ya pasó un corte simulado (tiene un ciclo nuevo): sus fechas ya no se pueden regresar.');
      }
      const original = new Date(backup[group.id].periodEnd).getTime();
      await shift(group.id, cycle.periodEnd.getTime() - original);
      delete backup[group.id];
      fs.writeFileSync(BACKUP, JSON.stringify(backup, null, 2));
      console.log(`${group.plan.platform.name}: fechas restauradas (corte ${fmt(original)}).`);
      await printState();
    } else {
      throw new Error(`Comando desconocido: ${cmd}`);
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
