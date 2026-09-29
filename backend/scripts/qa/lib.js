/* Utilidades de las pruebas de extremo a extremo (QA) de Partly: API, base de datos, viaje en el tiempo y limpieza. */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BACKEND = path.resolve(__dirname, '../..');
const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Todos los grupos que crean las pruebas llevan este prefijo en el plan: así se reconocen y se borran. */
const QA_PREFIX = 'QA ';
/** Correo de las cuentas desechables de cada corrida (dominio reservado que no existe: nunca recibe nada). */
const QA_EMAIL_DOMAIN = '@partly-qa.test';

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(BACKEND, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const ENV = readEnv();
const API = process.env.QA_API_URL || `http://127.0.0.1:${ENV.PORT || 3000}/api`;
const dbUrl = ENV.DATABASE_URL + (ENV.DATABASE_URL.includes('?') ? '&' : '?') + 'connect_timeout=60&pool_timeout=60&connection_limit=3';
const prisma = new PrismaClient({ datasourceUrl: dbUrl });

const token = (user) => jwt.sign({ sub: user.id, email: user.email, role: user.role }, ENV.JWT_ACCESS_SECRET, { expiresIn: '3h' });

async function call(method, route, tok, body) {
  const headers = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

/** Sube un comprobante del grupo. Por defecto un PDF mínimo válido. */
async function receipt(groupId, tok, content = Buffer.from('%PDF-1.4\n%qa'), type = 'application/pdf', name = 'comprobante.pdf') {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), name);
  const res = await fetch(`${API}/groups/${groupId}/payments/receipt`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: form });
  return { status: res.status, body: await res.text() };
}

/**
 * "Viaja en el tiempo" solo dentro de un grupo: recorre hacia atrás todas sus fechas (ciclos, membresías, pagos),
 * así para ese grupo "ahora" queda `ms` más adelante. No toca el reloj del sistema ni otros grupos.
 */
async function travel(groupId, ms) {
  // Al milisegundo: redondear a segundos podía dejar el corte medio segundo después y contar un día de más.
  const millis = Math.round(ms);
  await prisma.$executeRaw`UPDATE billing_cycles SET period_start = period_start - ${millis} * interval '1 millisecond', period_end = period_end - ${millis} * interval '1 millisecond' WHERE group_id = ${groupId}`;
  await prisma.$executeRaw`UPDATE groups SET next_renewal_date = next_renewal_date - ${millis} * interval '1 millisecond', started_at = started_at - ${millis} * interval '1 millisecond' WHERE id = ${groupId}`;
  await prisma.$executeRaw`UPDATE group_memberships SET current_period_end = current_period_end - ${millis} * interval '1 millisecond', joined_at = joined_at - ${millis} * interval '1 millisecond' WHERE group_id = ${groupId}`;
  await prisma.$executeRaw`UPDATE payments SET grace_until = grace_until - ${millis} * interval '1 millisecond', covered_from = covered_from - ${millis} * interval '1 millisecond', covered_until = covered_until - ${millis} * interval '1 millisecond', paid_at = paid_at - ${millis} * interval '1 millisecond', receipt_uploaded_at = receipt_uploaded_at - ${millis} * interval '1 millisecond' WHERE membership_id IN (SELECT id FROM group_memberships WHERE group_id = ${groupId})`;
}

/** Deja el corte del ciclo en curso a `ms` de ahora (negativo = el corte ya pasó). */
async function setCycleEndIn(groupId, ms) {
  const cycle = await prisma.billingCycle.findFirst({ where: { groupId, status: 'OPEN' }, orderBy: { periodEnd: 'desc' } });
  await travel(groupId, cycle.periodEnd.getTime() - (Date.now() + ms));
}

/**
 * Contexto de una corrida: usuarios de prueba, servicios de Nest (para correr las tareas programadas a mano),
 * verificaciones y registro de todo lo creado para limpiarlo al final.
 */
async function createRun() {
  if (ENV.NODE_ENV === 'production' && !process.env.QA_ALLOW_PRODUCTION) {
    // Las pruebas corren las tareas diarias (cobros, recordatorios) sobre toda la base: nunca contra datos reales.
    throw new Error('El .env es de producción. Estas pruebas solo se corren en desarrollo.');
  }
  const health = await fetch(`${API}/health/live`).catch(() => null);
  if (!health || !health.ok) throw new Error(`La API no responde en ${API}. Arráncala (npm run start:dev) antes de correr las pruebas.`);

  // Cuentas desechables solo para esta corrida: nunca se usan personas reales (con el correo real encendido les
  // llegarían avisos de prueba). Tienen los correos apagados, así la app no les manda nada, y se borran al final.
  const stamp = Date.now().toString(36);
  const makeUser = (name, role) =>
    prisma.user.create({
      data: {
        name,
        email: `qa.${name.split(' ').pop().toLowerCase()}.${stamp}${QA_EMAIL_DOMAIN}`,
        role,
        emailVerified: true,
        emailNotifications: false,
        phone: '5500000000',
      },
    });
  const admin = await makeUser('QA Admin', 'ADMIN');
  const seller = await makeUser('QA Vendedor', 'USER');
  const buyers = [];
  for (const name of ['QA Ana', 'QA Beto', 'QA Caro', 'QA Dani']) buyers.push(await makeUser(name, 'USER'));

  process.chdir(BACKEND);
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(path.join(BACKEND, 'dist/app.module.js'));
  const nest = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const service = (file, name) => nest.get(require(path.join(BACKEND, 'dist/modules', file))[name]);

  const run = {
    startedAt: new Date(),
    platformIdsBefore: new Set((await prisma.platform.findMany({ select: { id: true } })).map((p) => p.id)),
    groups: new Set(),
    admin, seller, buyers,
    users: [admin, seller, ...buyers],
    nest,
    services: {
      payments: () => service('payments/payments.service.js', 'PaymentsService'),
      commissions: () => service('commissions/commissions.service.js', 'CommissionsService'),
      reviews: () => service('reviews/reviews.service.js', 'ReviewsService'),
    },
    failures: 0,
    checks: 0,
    check(label, ok, extra = '') {
      run.checks += 1;
      if (!ok) run.failures += 1;
      console.log(`  ${ok ? '✔' : '✘'} ${label}${extra ? ' — ' + extra : ''}`);
    },
    track(groupId) { run.groups.add(groupId); return groupId; },
  };
  return run;
}

/** Crea un grupo de prueba ya aprobado (comisión fija del 9%) y con credenciales, sin miembros. */
async function createApprovedGroup(run, { name, price = 60, slots = 4 }) {
  const S = token(run.seller), A = token(run.admin);
  const created = await call('POST', '/groups', S, {
    platformName: 'Spotify', tierName: QA_PREFIX + name, maxSlots: slots + 1, officialPrice: price * (slots + 1),
    pricePerSlot: price, availableSlots: slots, bankAccountNumber: '646180112345678901',
  });
  if (created.status >= 300) throw new Error('No se pudo crear el grupo de prueba: ' + JSON.stringify(created.body));
  const groupId = run.track(created.body.id);
  for (const [method, route, tok, body] of [
    ['POST', `/groups/${groupId}/request-credentials`, A, {}],
    ['PUT', `/groups/${groupId}/credential`, S, { username: 'qa@partly.test', password: 'Secreta123' }],
    ['PUT', `/groups/${groupId}/approval`, A, { status: 'APPROVED' }],
  ]) {
    const r = await call(method, route, tok, body);
    if (r.status >= 300) throw new Error(`${method} ${route}: ${JSON.stringify(r.body)}`);
  }
  return groupId;
}

/** Grupo aprobado, iniciado y con todos los compradores ya pagados y con perfil asignado. */
async function buildGroup(run, { name, price = 60, slots, members }) {
  const groupId = await createApprovedGroup(run, { name, price, slots });
  const S = token(run.seller);
  for (const user of members) {
    const r = await call('POST', `/groups/${groupId}/join`, token(user), {});
    if (r.status >= 300) throw new Error(`${user.email} no pudo entrar: ${JSON.stringify(r.body)}`);
  }
  const started = await call('POST', `/groups/${groupId}/start`, S, {});
  if (started.status >= 300) throw new Error('No se pudo iniciar el grupo: ' + JSON.stringify(started.body));
  const profiles = await prisma.groupProfile.findMany({ where: { groupId }, orderBy: { label: 'asc' } });
  let i = 0;
  for (const user of members) {
    await receipt(groupId, token(user));
    const payment = await prisma.payment.findFirst({ where: { membership: { groupId, userId: user.id }, status: 'PENDING' } });
    const r = await call('PUT', `/groups/${groupId}/payments/${payment.id}/review`, S, { approve: true, profileId: profiles[i++].id });
    if (r.status >= 300) throw new Error('No se pudo aprobar un pago: ' + JSON.stringify(r.body));
  }
  return groupId;
}

async function deleteReceiptFiles(paths) {
  const dir = path.resolve(BACKEND, ENV.RECEIPTS_DIR || './uploads/receipts');
  for (const file of paths) {
    try { fs.unlinkSync(path.join(dir, file)); } catch { /* ya no está */ }
  }
}

/** Borra un grupo de prueba con todo lo que colgó de él (pagos, comprobantes en disco, ganancias, avisos…). */
async function deleteGroup(groupId) {
  const payments = await prisma.payment.findMany({ where: { membership: { groupId } }, select: { receiptPath: true } });
  await deleteReceiptFiles(payments.map((p) => p.receiptPath).filter(Boolean));
  // Las ganancias de prueba pudieron sumarse a un cobro de comisión que ya existía (real): se anotan ANTES de
  // borrar los pagos (al borrarlos, la base borra en cascada sus ganancias) y el cobro se recalcula al final.
  const touchedCharges = (await prisma.earningEntry.findMany({ where: { groupId, chargeId: { not: null } }, select: { chargeId: true }, distinct: ['chargeId'] })).map((e) => e.chargeId);
  await prisma.payment.deleteMany({ where: { membership: { groupId } } });
  await prisma.earningEntry.deleteMany({ where: { groupId } });
  await recalcCharges(touchedCharges);
  await prisma.groupProfile.deleteMany({ where: { groupId } });
  await prisma.review.deleteMany({ where: { groupId } });
  await prisma.incident.deleteMany({ where: { groupMembership: { groupId } } }).catch(() => {});
  await prisma.groupMembership.deleteMany({ where: { groupId } });
  await prisma.billingCycle.deleteMany({ where: { groupId } });
  await prisma.notification.deleteMany({ where: { groupId } });
  await prisma.credentialHistory.deleteMany({ where: { groupId } });
  await prisma.credential.deleteMany({ where: { groupId } });
  await prisma.adminActionLog.deleteMany({ where: { targetId: groupId } });
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (group) {
    await prisma.group.delete({ where: { id: groupId } });
    if ((await prisma.group.count({ where: { planId: group.planId } })) === 0) {
      await prisma.plan.delete({ where: { id: group.planId } }).catch(() => {});
    }
  }
}

/** Recalcula cobros de comisión con sus entradas actuales; si ya no les queda ninguna (eran solo de prueba) se borran. */
async function recalcCharges(chargeIds) {
  for (const id of chargeIds) {
    const charge = await prisma.commissionCharge.findUnique({ where: { id }, include: { entries: { select: { commission: true } } } });
    if (!charge) continue;
    if (charge.entries.length === 0) {
      if (charge.receiptPath) await deleteReceiptFiles([charge.receiptPath]);
      await prisma.commissionCharge.delete({ where: { id } });
    } else {
      const amount = Math.round(charge.entries.reduce((sum, e) => sum + Number(e.commission), 0) * 100) / 100;
      await prisma.commissionCharge.update({ where: { id }, data: { amount } });
    }
  }
}

/** Cobros de comisión que quedaron sin entradas (eran solo de grupos de prueba) se borran; los mixtos se recalculan. */
async function tidyCommissionCharges(since) {
  const charges = await prisma.commissionCharge.findMany({ where: { createdAt: { gte: since } }, include: { entries: { select: { commission: true } } } });
  for (const charge of charges) {
    if (charge.entries.length === 0) {
      if (charge.receiptPath) await deleteReceiptFiles([charge.receiptPath]);
      await prisma.commissionCharge.delete({ where: { id: charge.id } });
    } else {
      const amount = Math.round(charge.entries.reduce((sum, e) => sum + Number(e.commission), 0) * 100) / 100;
      await prisma.commissionCharge.update({ where: { id: charge.id }, data: { amount } });
    }
  }
}

/** Deja la base como estaba antes de la corrida. */
async function cleanup(run) {
  const groups = new Set(run.groups);
  // Por si una prueba se cortó a medias: cualquier grupo de prueba del vendedor creado en esta corrida.
  const strays = await prisma.group.findMany({ where: { ownerId: run.seller.id, createdAt: { gte: run.startedAt }, plan: { tierName: { startsWith: QA_PREFIX } } }, select: { id: true } });
  strays.forEach((g) => groups.add(g.id));
  for (const groupId of groups) await deleteGroup(groupId);
  await tidyCommissionCharges(run.startedAt);
  await prisma.notification.deleteMany({ where: { createdAt: { gte: run.startedAt }, groupId: null, userId: { in: run.users.map((u) => u.id) } } });
  // Solo los correos de las cuentas de la corrida: mientras corre, la app puede estar mandando correos reales a otras personas.
  await prisma.emailMessage.deleteMany({ where: { createdAt: { gte: run.startedAt }, toUserId: { in: run.users.map((u) => u.id) } } });
  // Solicitudes de comisión reducida de prueba y su bitácora de revisión.
  await prisma.commissionRateRequest.deleteMany({ where: { createdAt: { gte: run.startedAt } } });
  await prisma.adminActionLog.deleteMany({ where: { createdAt: { gte: run.startedAt }, actionType: { startsWith: 'COMMISSION_RATE_' } } });
  const newPlatforms = await prisma.platform.findMany({ where: { id: { notIn: [...run.platformIdsBefore] } }, include: { _count: { select: { plans: true } } } });
  for (const p of newPlatforms) if (p._count.plans === 0) await prisma.platform.delete({ where: { id: p.id } }).catch(() => {});
  await deleteQaUsers(run.users.map((u) => u.id));
  return groups.size;
}

/** Borra las cuentas desechables de una corrida con todo lo que quedó a su nombre fuera de los grupos de prueba. */
async function deleteQaUsers(ids) {
  if (ids.length === 0) return;
  const owned = await prisma.group.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
  for (const g of owned) await deleteGroup(g.id);
  const where = { in: ids };
  await prisma.groupMembership.deleteMany({ where: { userId: where } });
  await prisma.earningEntry.deleteMany({ where: { sellerId: where } });
  await prisma.commissionCharge.deleteMany({ where: { sellerId: where } });
  await prisma.commissionRateRequest.deleteMany({ where: { sellerId: where } });
  await prisma.incidentMessage.deleteMany({ where: { authorUserId: where } });
  await prisma.incident.deleteMany({ where: { OR: [{ reportedByUserId: where }, { assignedToUserId: where }] } });
  await prisma.providerOrder.deleteMany({ where: { buyerUserId: where } });
  await prisma.credentialHistory.deleteMany({ where: { changedByUserId: where } });
  await prisma.adminActionLog.deleteMany({ where: { adminUserId: where } });
  await prisma.emailMessage.deleteMany({ where: { toUserId: where } });
  await prisma.user.deleteMany({ where: { id: where } });
}

/** Cuentas desechables que quedaron de corridas interrumpidas. */
async function strayQaUserIds() {
  return (await prisma.user.findMany({ where: { email: { endsWith: QA_EMAIL_DOMAIN } }, select: { id: true } })).map((u) => u.id);
}

module.exports = {
  BACKEND, ENV, API, DAY, HOUR, QA_PREFIX, prisma,
  token, call, receipt, travel, setCycleEndIn,
  createRun, createApprovedGroup, buildGroup, deleteGroup, tidyCommissionCharges, cleanup, deleteQaUsers, strayQaUserIds,
};
