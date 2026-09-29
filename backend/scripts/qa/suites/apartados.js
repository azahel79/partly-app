/* Comisión fija del 9%, comisión reducida por reputación, aviso de misma plataforma, lista de lugares apartados y soltar un lugar. */
const { prisma, token, call, receipt, createApprovedGroup, buildGroup } = require('../lib');

module.exports = {
  title: 'Comisión del 9%, lugares apartados y misma plataforma',
  // El vendedor es una cuenta desechable de la corrida: la rebaja de prueba no toca a nadie real.
  async run(run) {
    const { check } = run;
    const [a, b, c, d] = run.buyers;
    const S = token(run.seller), A = token(run.admin);
    const membership = (gid, u) => prisma.groupMembership.findFirst({ where: { groupId: gid, userId: u.id }, orderBy: { joinedAt: 'desc' } });

    console.log('\n[1] Comisión fija del 9%');
    const paid = await buildGroup(run, { name: 'Nueve', price: 100, slots: 2, members: [a, b] });
    const group = await prisma.group.findUnique({ where: { id: paid } });
    check('un grupo nuevo nace con la comisión del 9%', Number(group.commissionPercentage) === 9, `${group.commissionPercentage}%`);
    const entry = await prisma.earningEntry.findFirst({ where: { groupId: paid } });
    check('el pago validado se registra con 9% de comisión', entry && Number(entry.commissionPercentage) === 9 && Number(entry.commission) === 9, entry ? `$${entry.commission} de $${entry.gross}` : 'sin registro');
    const welcome = await prisma.notification.findFirst({ where: { userId: a.id, groupId: paid, type: 'MEMBERSHIP_ACTIVATED' } });
    const plainConfirm = await prisma.notification.count({ where: { userId: a.id, groupId: paid, type: 'PAYMENT_CONFIRMED' } });
    check('al validarse su primer pago el comprador recibe la bienvenida con su perfil (y no un simple "pago confirmado")', !!welcome && /Tu perfil es/.test(welcome.payload) && plainConfirm === 0);

    console.log('\n[2] Comisión reducida por reputación');
    let mine = (await call('GET', '/commissions/rate', S)).body;
    check('el vendedor ve su comisión y los requisitos para bajarla', mine.rate === 9 && mine.requirements?.length === 3, `${mine.rate}% · ${mine.requirements?.filter((r) => r.met).length}/3 requisitos`);
    if (!mine.allMet) {
      const r = await call('POST', '/commissions/rate/request', S, {});
      check('sin cumplir los requisitos no puede pedirla', r.status === 400);
    }
    // El vendedor de prueba no tiene 30 pagos: la solicitud se crea directo para probar la revisión del admin.
    const req = await prisma.commissionRateRequest.create({ data: { sellerId: run.seller.id, currentRate: 9, message: 'Prueba QA' } });
    let r = await call('PUT', `/admin/commission-rate-requests/${req.id}`, A, { approve: true, rate: 9 });
    check('no se puede "bajar" a un porcentaje igual al actual', r.status === 400);
    r = await call('PUT', `/admin/commission-rate-requests/${req.id}`, A, { approve: true, rate: 5 });
    check('no se puede bajar de 6%', r.status === 400);
    r = await call('GET', '/admin/commission-rate-requests', A);
    check('el admin ve la solicitud con la reputación del vendedor', r.status === 200 && r.body.data.some((x) => x.id === req.id && x.requirements?.length === 3));
    r = await call('PUT', `/admin/commission-rate-requests/${req.id}`, A, { approve: true, rate: 7 });
    check('el admin la autoriza al 7%', r.status === 200);
    mine = (await call('GET', '/commissions/rate', S)).body;
    check('la comisión del vendedor queda en 7%', mine.rate === 7 && mine.reduced === true);
    check('todos sus grupos pasan al 7%', Number((await prisma.group.findUnique({ where: { id: paid } })).commissionPercentage) === 7);
    const newer = await createApprovedGroup(run, { name: 'Siete', price: 50, slots: 2 });
    check('un grupo nuevo del vendedor nace con su 7%', Number((await prisma.group.findUnique({ where: { id: newer } })).commissionPercentage) === 7);
    check('se le avisó al vendedor', !!(await prisma.notification.findFirst({ where: { userId: run.seller.id, type: 'COMMISSION_RATE_APPROVED', createdAt: { gte: run.startedAt } } })));
    r = await call('PUT', `/admin/commission-rate-requests/${req.id}`, A, { approve: false, note: 'otra vez' });
    check('una solicitud ya revisada no se puede volver a revisar', r.status === 400);
    const req2 = await prisma.commissionRateRequest.create({ data: { sellerId: run.seller.id, currentRate: 7 } });
    r = await call('PUT', `/admin/commission-rate-requests/${req2.id}`, A, { approve: false });
    check('rechazar sin motivo no se permite', r.status === 400);
    r = await call('PUT', `/admin/commission-rate-requests/${req2.id}`, A, { approve: false, note: 'Aún pocas reseñas.' });
    mine = (await call('GET', '/commissions/rate', S)).body;
    check('al rechazarla conserva su comisión y debe esperar para volver a pedirla', r.status === 200 && mine.rate === 7 && !!mine.retryAt && mine.canRequest === false);

    console.log('\n[3] Aviso al apartar en otro grupo de la misma plataforma');
    const g1 = await createApprovedGroup(run, { name: 'Apartado uno', price: 60, slots: 4 });
    const g2 = await createApprovedGroup(run, { name: 'Apartado dos', price: 55, slots: 4 });
    check(`${d.name} aparta un lugar en el primer grupo`, (await call('POST', `/groups/${g1}/join`, token(d), {})).status === 201);
    check('se le confirma que apartó su lugar y que no paga nada todavía', !!(await prisma.notification.findFirst({ where: { userId: d.id, groupId: g1, type: 'SEAT_RESERVED' } })));
    let sim = (await call('GET', `/groups/${g2}/similar-membership`, token(d))).body;
    check('al ver otro grupo de Spotify se le avisa que ya apartó uno', sim && sim.groupId === g1 && sim.status === 'RESERVED' && sim.canSwitch === true);
    r = await call('POST', `/groups/${g2}/join`, token(d), { switchFromGroupId: g1 });
    check('"Cambiarme a este": entra al segundo grupo…', r.status === 201 && (await membership(g2, d)).status === 'RESERVED');
    check('…y su lugar del primero queda libre', (await membership(g1, d)).status === 'CANCELLED');
    sim = (await call('GET', `/groups/${g1}/similar-membership`, token(a))).body;
    check(`${a.name} tiene un lugar pagado en otro grupo de Spotify: se le avisa pero no puede "cambiarse" soltándolo`, sim && sim.canSwitch === false);
    r = await call('POST', `/groups/${g1}/join`, token(a), { switchFromGroupId: paid });
    check('el servidor tampoco deja soltar un lugar ya pagado al cambiarse', r.status === 400 && (await membership(paid, a)).status === 'ACTIVE');

    console.log('\n[4] Mis lugares apartados y soltar un lugar');
    const reserved = (await call('GET', '/groups/reserved', token(d))).body;
    check('en Mis grupos aparece el lugar apartado (todavía sin pagar)', Array.isArray(reserved) && reserved.some((x) => x.group.id === g2 && x.membership.status === 'RESERVED'));
    const before = (await call('GET', `/groups/${g2}`, token(d))).body.reservedSlots;
    r = await call('POST', `/groups/${g2}/leave`, token(d), {});
    const after = (await call('GET', `/groups/${g2}`, S)).body.reservedSlots;
    check('al soltar su lugar apartado queda libre para otra persona', r.status === 204 && after === before - 1 && (await membership(g2, d)).status === 'CANCELLED', `${before} → ${after} apartados`);
    check('el vendedor recibe el aviso', !!(await prisma.notification.findFirst({ where: { userId: run.seller.id, groupId: g2, payload: { contains: 'soltó el lugar' } } })));

    // Grupo iniciado: los que apartaron tienen un pago pendiente de 48 horas.
    for (const u of [a, b, c]) await call('POST', `/groups/${g1}/join`, token(u), {});
    r = await call('POST', `/groups/${g1}/start`, S, {});
    check('el grupo inicia y se les genera su pago', r.status === 201 && (await membership(g1, b)).status === 'PENDING_PAYMENT');
    r = await call('POST', `/groups/${g1}/leave`, token(b), {});
    const orphan = await prisma.payment.count({ where: { membership: { groupId: g1, userId: b.id }, status: 'PENDING' } });
    check('quien suelta su lugar antes de pagar no deja un cobro colgado', r.status === 204 && orphan === 0);
    await receipt(g1, token(c));
    r = await call('POST', `/groups/${g1}/leave`, token(c), {});
    check('con un comprobante en revisión no puede soltar su lugar (el dinero pudo haber llegado)', r.status === 400 && (await membership(g1, c)).status === 'PENDING_PAYMENT');

    // Entrar a un grupo que ya inició: se le avisa cuánto pagar y que tiene 48 horas.
    r = await call('POST', `/groups/${g1}/join`, token(d), {});
    const due = await prisma.notification.findFirst({ where: { userId: d.id, groupId: g1, type: 'PAYMENT_DUE_SOON', payload: { contains: 'Entraste' } } });
    check('quien entra a un grupo ya iniciado recibe el aviso con el monto y las 48 horas para pagar', r.status === 201 && !!due && /48 horas/.test(due.payload));
  },
};
