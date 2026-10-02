/* Tipo de acceso y duración: invitación al grupo familiar, grupos de 2 meses, mayoreo por panel y Tequio
 * actualizando las credenciales de una cuenta de su tienda (con aviso en el reporte). */
const path = require('path');
const { BACKEND, DAY, HOUR, QA_PREFIX, prisma, token, call, receipt, setCycleEndIn } = require('../lib');

const TAG = 'QA-ACCESO';
const CLABE = '646180112345678901';

/** Aprueba un grupo: si se da `access`, antes Tequio lo pide y el vendedor lo envía (si no, ya estaba enviado). */
async function approve(groupId, S, A, access) {
  for (const [method, route, tok, body] of [
    ...(access ? [['POST', `/groups/${groupId}/request-credentials`, A, {}], ['PUT', `/groups/${groupId}/credential`, S, access]] : []),
    ['PUT', `/groups/${groupId}/approval`, A, { status: 'APPROVED' }],
  ]) {
    const r = await call(method, route, tok, body);
    if (r.status >= 300) throw new Error(`${method} ${route}: ${JSON.stringify(r.body)}`);
  }
}

/** Un comprador aparta, el vendedor inicia el grupo y le aprueba el pago. */
async function joinAndPay(groupId, user, S) {
  let r = await call('POST', `/groups/${groupId}/join`, token(user), {});
  if (r.status >= 300) throw new Error('No pudo entrar: ' + JSON.stringify(r.body));
  r = await call('POST', `/groups/${groupId}/start`, S, {});
  if (r.status >= 300) throw new Error('No se pudo iniciar: ' + JSON.stringify(r.body));
  await receipt(groupId, token(user));
  const payment = await prisma.payment.findFirst({ where: { membership: { groupId, userId: user.id }, status: 'PENDING' } });
  const profile = await prisma.groupProfile.findFirst({ where: { groupId }, orderBy: { label: 'asc' } });
  r = await call('PUT', `/groups/${groupId}/payments/${payment.id}/review`, S, { approve: true, profileId: profile.id });
  if (r.status >= 300) throw new Error('No se pudo aprobar el pago: ' + JSON.stringify(r.body));
}

/** Meses entre dos fechas (UTC), para comprobar lo que dura un periodo. */
const monthsBetween = (from, to) => (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();

module.exports = {
  title: 'Acceso por invitación, duraciones, panel y credenciales de Tequio',
  async run(run) {
    const { check } = run;
    const [ana, beto] = run.buyers;
    const S = token(run.seller), A = token(run.admin);
    const extra = { plans: [], profile: null };

    try {
      console.log('\n[1] Invitación al grupo familiar y duración de 2 meses');
      const base = { maxSlots: 2, officialPrice: 120, pricePerSlot: 60, availableSlots: 1, bankAccountNumber: CLABE };
      let r = await call('POST', '/groups', S, { ...base, platformName: 'Netflix', tierName: QA_PREFIX + 'Invitación no', accessType: 'INVITE_LINK' });
      check('Netflix no acepta invitación (solo YouTube, Spotify y Canva)', r.status === 400);
      if (r.status < 300) run.track(r.body.id);
      check('y el rechazo no deja un plan vacío guardado', (await prisma.plan.count({ where: { tierName: QA_PREFIX + 'Invitación no' } })) === 0);

      r = await call('POST', '/groups', S, { ...base, platformName: 'YouTube', tierName: QA_PREFIX + 'Familiar', accessType: 'INVITE_LINK', billingPeriod: 'BIMONTHLY' });
      if (r.status >= 300) throw new Error('No se pudo crear el grupo por invitación: ' + JSON.stringify(r.body));
      const invite = run.track(r.body.id);
      const plan = await prisma.plan.findFirst({ where: { groups: { some: { id: invite } } } });
      check('el grupo queda con acceso por invitación', r.body.accessType === 'INVITE_LINK');
      check('y se cobra cada 2 meses', plan.billingPeriod === 'BIMONTHLY');

      await call('POST', `/groups/${invite}/request-credentials`, A, {});
      r = await call('PUT', `/groups/${invite}/credential`, S, { username: 'x@y.com', password: 'Secreta123' });
      check('un grupo por invitación pide el link, no la contraseña', r.status === 400);
      r = await call('PUT', `/groups/${invite}/credential`, S, { inviteLink: 'no-es-un-link' });
      check('el link de invitación debe ser una dirección web', r.status === 400);
      const link = 'https://families.youtube.com/join/qa-acceso';
      r = await call('PUT', `/groups/${invite}/credential`, S, { inviteLink: link });
      check('el vendedor envía el link de invitación', r.status === 200 || r.status === 201, JSON.stringify(r.body).slice(0, 120));
      const review = await call('GET', `/groups/${invite}/credential`, A);
      check('Tequio ve el link al revisar el grupo', review.body.inviteLink === link && review.body.accessType === 'INVITE_LINK');
      await approve(invite, S, A, null);
      await joinAndPay(invite, ana, S);
      const seen = await call('GET', `/groups/${invite}/credential`, token(ana));
      check('el miembro que pagó ve el link y no una contraseña', seen.body.inviteLink === link && !seen.body.password, JSON.stringify(seen.body).slice(0, 160));
      const cycle = await prisma.billingCycle.findFirst({ where: { groupId: invite }, orderBy: { periodStart: 'desc' } });
      const months = cycle ? (cycle.periodEnd.getUTCFullYear() - cycle.periodStart.getUTCFullYear()) * 12 + cycle.periodEnd.getUTCMonth() - cycle.periodStart.getUTCMonth() : 0;
      check('su periodo dura 2 meses', months === 2, cycle ? `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}` : 'sin ciclo');

      console.log('\n[2] Mayoreo por panel y credenciales que actualiza Tequio');
      const platform = await prisma.platform.findFirst({ where: { name: 'Spotify' } });
      const profile = await prisma.providerProfile.create({ data: { userId: run.admin.id, businessName: `${TAG} tienda`, status: 'APPROVED' } });
      extra.profile = profile.id;
      const wholesalePlan = await prisma.plan.create({ data: { platformId: platform.id, tierName: QA_PREFIX + 'Mayoreo', officialPrice: 200, maxSlots: 4, commissionPercentage: 9 } });
      extra.plans.push(wholesalePlan.id);
      const listing = await prisma.providerListing.create({ data: { providerProfileId: profile.id, planId: wholesalePlan.id, wholesalePrice: 100, stockQuantity: 5 } });
      const order = (expiresInDays) =>
        prisma.providerOrder.create({
          data: { listingId: listing.id, buyerUserId: run.seller.id, unitPrice: 100, status: 'PENDING_DELIVERY', paidAt: new Date(), validityDays: 30, expiresAt: new Date(Date.now() + expiresInDays * 86_400_000) },
        });

      const panelOrder = await order(30);
      r = await call('PUT', `/provider-orders/${panelOrder.id}/deliver`, A, { notes: 'sin nada' });
      check('para entregar hace falta la contraseña o el link del panel', r.status === 400);
      r = await call('PUT', `/provider-orders/${panelOrder.id}/deliver`, A, { panelUrl: 'https://panel.qa.test/alta', username: 'vendedor', password: 'Panel123' });
      check('Tequio entrega una cuenta por panel', r.status === 200, JSON.stringify(r.body).slice(0, 120));
      const panelCred = await call('GET', `/provider-orders/${panelOrder.id}/credential`, S);
      check('el vendedor ve el link y los datos del panel', panelCred.body.panelUrl === 'https://panel.qa.test/alta' && panelCred.body.username === 'vendedor');
      r = await call('POST', `/provider-orders/${panelOrder.id}/create-group`, S, { pricePerSlot: 60, availableSlots: 1, bankAccountNumber: CLABE });
      if (r.status >= 300) throw new Error('No se pudo publicar la cuenta por panel: ' + JSON.stringify(r.body));
      const panelGroup = run.track(r.body.id);
      const panelGroupRow = await prisma.group.findUnique({ where: { id: panelGroup }, include: { credential: true } });
      check('al publicarla no se copia el panel como contraseña del grupo', !panelGroupRow.credential && panelGroupRow.credentialReviewStatus === 'REQUESTED');
      r = await call('PUT', `/groups/${panelGroup}/credential`, S, { username: 'miembros@qa.test', password: 'Grupo123' });
      check('por panel, el acceso del grupo lo pone el vendedor', r.status === 200 || r.status === 201);

      const credOrder = await order(30);
      await call('PUT', `/provider-orders/${credOrder.id}/deliver`, A, { username: 'cuenta@qa.test', password: 'Vieja123' });
      r = await call('POST', `/provider-orders/${credOrder.id}/create-group`, S, { pricePerSlot: 60, availableSlots: 1, bankAccountNumber: CLABE });
      if (r.status >= 300) throw new Error('No se pudo publicar la cuenta con credenciales: ' + JSON.stringify(r.body));
      const managed = run.track(r.body.id);
      await approve(managed, S, A, null);
      await joinAndPay(managed, beto, S);
      r = await call('PUT', `/groups/${managed}/credential`, S, { username: 'cuenta@qa.test', password: 'MiCambio1' });
      check('el vendedor no puede cambiar la contraseña de una cuenta de Tequio', r.status === 403);

      r = await call('POST', '/incidents', S, { context: 'PROVIDER_ORDER', providerOrderId: credOrder.id, subject: `${TAG} no entra`, message: 'La contraseña ya no funciona.' });
      if (r.status >= 300) throw new Error('No se pudo reportar la compra: ' + JSON.stringify(r.body));
      const sellerReport = r.body.id;
      const membership = await prisma.groupMembership.findFirst({ where: { groupId: managed, userId: beto.id } });
      r = await call('POST', '/incidents', token(beto), { context: 'GROUP_MEMBERSHIP', groupMembershipId: membership.id, subject: `${TAG} miembro sin acceso`, message: 'No puedo entrar.' });
      const memberReport = r.body.id;
      const aboutMember = await call('GET', `/incidents/${memberReport}`, S);
      check('el reporte del miembro indica que la contraseña la administra Tequio', aboutMember.body.about?.credentialsManagedByPartly === true);

      r = await call('PUT', `/provider-orders/${credOrder.id}/credential`, S, { username: 'cuenta@qa.test', password: 'Nueva123' });
      check('solo Tequio actualiza las credenciales de su cuenta', r.status === 403);
      r = await call('PUT', `/provider-orders/${credOrder.id}/credential`, A, { username: 'cuenta@qa.test', password: 'Nueva123', changeReason: `${TAG} contraseña bloqueada` });
      check('Tequio actualiza las credenciales desde Mi tienda', r.status === 200, JSON.stringify(r.body).slice(0, 160));
      const groupCred = await call('GET', `/groups/${managed}/credential`, token(beto));
      check('el grupo del vendedor recibe la contraseña nueva', groupCred.body.password === 'Nueva123');
      const memberNotice = await prisma.notification.findFirst({ where: { userId: beto.id, type: 'CREDENTIAL_UPDATED', groupId: managed } });
      check('a los miembros se les avisa del cambio', !!memberNotice);
      for (const [id, who] of [[sellerReport, 'del vendedor'], [memberReport, 'del miembro']]) {
        const inc = await prisma.incident.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } } });
        check(`el reporte ${who} recibe la respuesta de Tequio y pasa a revisión`, inc.status === 'IN_REVIEW' && /actualiz/i.test(inc.messages[0]?.body ?? ''), inc.messages[0]?.body);
      }
      r = await call('PUT', `/incidents/${sellerReport}/status`, S, { status: 'RESOLVED' });
      check('el vendedor cierra su reporte con "Ya quedó"', r.status === 200);

      console.log('\n[3] Grupos de 3 meses y anuales: renovación, avisos y cierre');
      const { EMAIL_RULES } = require(path.join(BACKEND, 'dist/modules/notifications/email-rules.js'));
      const daily = () => run.services.payments().processDailyBilling();
      const [, , caro, dani] = run.buyers;
      const periodGroup = async (name, billingPeriod, member) => {
        const created = await call('POST', '/groups', S, { ...base, platformName: 'Netflix', tierName: QA_PREFIX + name, billingPeriod });
        if (created.status >= 300) throw new Error(`No se pudo crear el grupo ${name}: ` + JSON.stringify(created.body));
        const id = run.track(created.body.id);
        await approve(id, S, A, { username: 'qa@partly.test', password: 'Secreta123' });
        await joinAndPay(id, member, S);
        return id;
      };

      const quarterly = await periodGroup('Trimestral', 'QUARTERLY', caro);
      let open = await prisma.billingCycle.findFirst({ where: { groupId: quarterly, status: 'OPEN' } });
      check('el primer periodo del grupo trimestral dura 3 meses', monthsBetween(open.periodStart, open.periodEnd) === 3);
      await setCycleEndIn(quarterly, 4 * DAY);
      await daily();
      check('a 4 días del corte todavía no hay cobro', (await prisma.payment.count({ where: { forNextCycle: true, membership: { groupId: quarterly } } })) === 0);
      await setCycleEndIn(quarterly, 2.5 * DAY);
      await daily();
      const renewal = await prisma.payment.findFirst({ where: { forNextCycle: true, membership: { groupId: quarterly, userId: caro.id } } });
      check('3 días antes del corte se genera el cobro de renovación', !!renewal && Number(renewal.amount) === 60);
      check('el cobro cubre los 3 meses siguientes', !!renewal && monthsBetween(renewal.coveredFrom, renewal.coveredUntil) === 3);
      const due = await prisma.notification.findFirst({ where: { userId: caro.id, groupId: quarterly, type: 'PAYMENT_DUE_SOON', payload: { contains: 'se renueva' } } });
      check('el aviso del cobro habla del "siguiente periodo", no del mes', !!due && /siguiente periodo/.test(due.payload) && !/mes siguiente/.test(due.payload), due?.payload);
      check('y ese aviso también sale por correo', !!EMAIL_RULES.PAYMENT_DUE_SOON);
      await receipt(quarterly, token(caro));
      r = await call('PUT', `/groups/${quarterly}/payments/${renewal.id}/review`, S, { approve: true });
      check('el vendedor aprueba la renovación', r.status === 200, JSON.stringify(r.body).slice(0, 120));
      check('el comprador recibe "renovación confirmada" (también por correo)', !!(await prisma.notification.findFirst({ where: { userId: caro.id, groupId: quarterly, type: 'RENEWAL_CONFIRMED' } })) && !!EMAIL_RULES.RENEWAL_CONFIRMED);
      // El periodo se cierra pasada la gracia de 48 horas después del corte.
      await setCycleEndIn(quarterly, -(48 * HOUR + HOUR));
      await daily();
      open = await prisma.billingCycle.findFirst({ where: { groupId: quarterly, status: 'OPEN' } });
      // Las fechas se movieron con el calendario del grupo: se vuelve a leer el cobro.
      const paid = await prisma.payment.findUnique({ where: { id: renewal.id } });
      const caroMembership = await prisma.groupMembership.findFirst({ where: { groupId: quarterly, userId: caro.id } });
      check('al cortar, el grupo pasa a un nuevo periodo de 3 meses', !!open && monthsBetween(open.periodStart, open.periodEnd) === 3 && open.periodStart.getTime() === paid.coveredFrom.getTime());
      check('y el comprador sigue activo hasta el fin del nuevo periodo', caroMembership.status === 'ACTIVE' && caroMembership.currentPeriodEnd.getTime() === open.periodEnd.getTime(), `${caroMembership.status} ${caroMembership.currentPeriodEnd?.toISOString()} vs ${open.periodEnd.toISOString()}`);

      // Quien nunca ha vendido (el vendedor de la corrida pudo ganar reputación en otras pruebas).
      const newSeller = token(ana);
      r = await call('POST', '/groups', newSeller, { ...base, platformName: 'Netflix', tierName: QA_PREFIX + 'Anual sin reputación', billingPeriod: 'ANNUAL' });
      check('sin reputación no se puede crear un grupo anual', r.status === 403);
      r = await call('POST', '/groups', newSeller, { ...base, platformName: 'Netflix', tierName: QA_PREFIX + 'Semestral sin reputación', billingPeriod: 'SEMIANNUAL' });
      check('ni uno de 6 meses', r.status === 403);
      check('y el rechazo no deja planes vacíos', (await prisma.plan.count({ where: { tierName: { endsWith: 'sin reputación' } } })) === 0);
      // Un vendedor con comisión reducida ya demostró su reputación.
      const sellerRate = (await prisma.user.findUnique({ where: { id: run.seller.id } })).commissionRate;
      await prisma.user.update({ where: { id: run.seller.id }, data: { commissionRate: 7 } });
      const annual = await periodGroup('Anual', 'ANNUAL', dani);
      await prisma.user.update({ where: { id: run.seller.id }, data: { commissionRate: sellerRate } });
      open = await prisma.billingCycle.findFirst({ where: { groupId: annual, status: 'OPEN' } });
      check('el periodo del grupo anual dura 12 meses', monthsBetween(open.periodStart, open.periodEnd) === 12);
      r = await call('PUT', `/groups/${annual}/my-membership/auto-renew`, token(dani), { autoRenew: false });
      check('el comprador apaga la renovación del anual', r.status === 200 && r.body.autoRenew === false);
      await setCycleEndIn(annual, 2.5 * DAY);
      await daily();
      check('quien no renueva no recibe cobro', (await prisma.payment.count({ where: { forNextCycle: true, membership: { groupId: annual } } })) === 0);
      await setCycleEndIn(annual, -HOUR);
      await daily();
      const daniMembership = await prisma.groupMembership.findFirst({ where: { groupId: annual, userId: dani.id } });
      check('al terminar el año, sale del grupo', daniMembership.status === 'CANCELLED');
      const left = await prisma.notification.findFirst({ where: { userId: run.seller.id, groupId: annual, type: 'MEMBER_LEFT' } });
      check('al vendedor le llega el aviso de cambiar la contraseña (también por correo)', !!left && !!EMAIL_RULES.MEMBER_LEFT);
    } finally {
      await prisma.notification.deleteMany({ where: { payload: { contains: TAG } } });
      await prisma.emailMessage.deleteMany({ where: { subject: { contains: TAG } } });
      // Las compras de mayoreo de prueba se borran con su tienda (sus grupos los borra la limpieza general).
      if (extra.profile) {
        await prisma.incident.deleteMany({ where: { OR: [{ subject: { contains: TAG } }, { providerOrder: { listing: { providerProfileId: extra.profile } } }] } });
        await prisma.providerOrder.deleteMany({ where: { listing: { providerProfileId: extra.profile } } });
        await prisma.providerListing.deleteMany({ where: { providerProfileId: extra.profile } });
        await prisma.providerProfile.delete({ where: { id: extra.profile } });
      }
      for (const id of extra.plans) await prisma.plan.delete({ where: { id } }).catch(() => {});
    }
  },
};
