/* Renovación por adelantado (cobro 3 días antes), lugares por liberarse, reservas y pérdida del lugar por no pagar. */
const { DAY, HOUR, prisma, token, call, receipt, travel, setCycleEndIn, buildGroup } = require('../lib');

module.exports = {
  title: 'Renovación por adelantado y lugares por liberarse',
  async run(run) {
    const { check, admin, seller } = run;
    const [a, b, c, d] = run.buyers; // a: no renueva · b: paga · c: no paga · d: aparta el lugar que se libera
    const S = token(seller), A = token(admin);
    const daily = () => run.services.payments().processDailyBilling();
    let gid;
    const mem = (u) => prisma.groupMembership.findFirst({ where: { groupId: gid, userId: u.id }, orderBy: { joinedAt: 'desc' } });
    const charge = (u) => prisma.payment.findFirst({ where: { forNextCycle: true, membership: { groupId: gid, userId: u.id } }, orderBy: { billingCycle: { periodEnd: 'desc' } } });
    const members = async () => (await call('GET', `/groups/${gid}/members`, S)).body;
    const statusOf = async (u) => (await members()).find((m) => m.user.id === u.id)?.renewalStatus ?? null;
    const groupDto = async () => (await call('GET', `/groups/${gid}`, S)).body;
    const listed = async (u, q = '') => ((await call('GET', `/groups?withSpots=true&limit=100${q}`, token(u))).body.data || []).find((g) => g.id === gid);

    console.log(`\n[1] Grupo de 4 lugares, todos pagados (${a.name}, ${b.name}, ${c.name} y ${admin.name})`);
    gid = await buildGroup(run, { name: 'Renovación', price: 80, slots: 4, members: [a, b, c, admin] });
    let g = await groupDto();
    check('el grupo quedó lleno con 4 activos', g.occupiedSlots === 4 && g.status === 'FULL', `${g.occupiedSlots} ${g.status}`);
    check('lleno y sin nadie por irse: no aparece en el marketplace', !(await listed(d)));

    console.log('\n[2] Faltan 4 días para el corte');
    await setCycleEndIn(gid, 4 * DAY);
    await daily();
    check('todavía nadie recibe cobro de renovación', (await prisma.payment.count({ where: { forNextCycle: true, membership: { groupId: gid } } })) === 0);

    console.log(`\n[3] ${a.name} apaga la renovación; ${d.name} aparta su lugar`);
    let r = await call('PUT', `/groups/${gid}/my-membership/auto-renew`, token(a), { autoRenew: false });
    check('la apaga', r.status === 200 && r.body.autoRenew === false);
    g = await groupDto();
    check('el grupo muestra 1 lugar por liberarse', g.freeingSlots === 1 && !!g.freeingDate && g.nextCycleReserved === 0, `freeing ${g.freeingSlots}`);
    const inMarket = await listed(d);
    check('aparece en el marketplace aunque esté lleno', !!inMarket && inMarket.freeingSlots === 1);
    check('y en la etapa "Lugares por liberarse"', !!(await listed(d, '&stage=freeing')));
    check('pero no en "Activos con lugares"', !(await listed(d, '&stage=running')));
    const preview = (await call('GET', `/groups/${gid}/join-preview`, token(d))).body;
    check('la vista previa ofrece apartar sin pagar', preview.reserveFreeingSeat === true && preview.payNow === false && !!preview.freeingDate);
    r = await call('POST', `/groups/${gid}/join`, token(d), {});
    check('lo aparta: queda RESERVADO y sin pago', r.status === 201 && r.body.status === 'RESERVED', `${r.status} ${r.body.status}`);
    check('no se le generó ningún pago', (await prisma.payment.count({ where: { membership: { groupId: gid, userId: d.id } } })) === 0);
    check('el vendedor recibe el aviso', !!(await prisma.notification.findFirst({ where: { userId: seller.id, groupId: gid, payload: { contains: 'apartó el lugar' } } })));
    g = await groupDto();
    check('ya no queda lugar por apartar', g.freeingSlots === 0 && g.nextCycleReserved === 1);
    check('el vendedor ve "No renovará" y "Apartó un lugar"', (await statusOf(a)) === 'NOT_RENEWING' && (await statusOf(d)) === 'RESERVED_NEXT');

    console.log('\n[4] Faltan 2.5 días: se abre la ventana de renovación');
    await travel(gid, 1.5 * DAY);
    await daily();
    const cb = await charge(b), cc = await charge(c), cAdmin = await charge(admin);
    check('los que renuevan reciben su cobro de $80', !!cb && !!cc && !!cAdmin && Number(cb.amount) === 80 && cb.status === 'PENDING');
    check('quien apagó la renovación no recibe cobro', !(await charge(a)));
    const cycle = await prisma.billingCycle.findFirst({ where: { groupId: gid, status: 'OPEN' } });
    check('el cobro cubre del corte al fin del ciclo siguiente', cb.coveredFrom.getTime() === cycle.periodEnd.getTime() && cb.coveredUntil.getTime() > cycle.periodEnd.getTime() + 25 * DAY);
    check('el plazo vence 48 horas después del corte', cb.graceUntil.getTime() === cycle.periodEnd.getTime() + 48 * HOUR);
    const notice = await prisma.notification.findFirst({ where: { userId: b.id, groupId: gid, type: 'PAYMENT_DUE_SOON', payload: { contains: 'renovación' } } });
    check('el comprador recibe el aviso del cobro', !!notice && /Ya puedes pagar tu renovación/.test(notice.payload));
    check('el vendedor ve "pendiente de pago" en quienes renuevan', (await statusOf(b)) === 'PENDING' && (await statusOf(c)) === 'PENDING' && (await statusOf(admin)) === 'PENDING');
    await daily();
    check('correr el proceso otra vez no duplica cobros', (await prisma.payment.count({ where: { forNextCycle: true, membership: { groupId: gid } } })) === 3);

    console.log(`\n[5] ${admin.name} apaga y vuelve a encender la renovación`);
    r = await call('PUT', `/groups/${gid}/my-membership/auto-renew`, A, { autoRenew: false });
    check('al apagarla se le retira el cobro', r.status === 200 && !(await charge(admin)));
    r = await call('PUT', `/groups/${gid}/my-membership/auto-renew`, A, { autoRenew: true });
    const cAdmin2 = await charge(admin);
    check('al encenderla se le genera el cobro al momento', r.status === 200 && !!cAdmin2 && cAdmin2.status === 'PENDING');
    check('la reserva del otro comprador sigue en pie', (await mem(d)).status === 'RESERVED');

    console.log('\n[6] Pagos de renovación');
    check('sube su comprobante', (await receipt(gid, token(b))).status === 201);
    check('el vendedor lo ve "en revisión"', (await statusOf(b)) === 'IN_REVIEW');
    r = await call('PUT', `/groups/${gid}/payments/${cb.id}/review`, S, { approve: true });
    check('el vendedor lo aprueba y lo ve "Renovó"', r.status === 200 && (await statusOf(b)) === 'RENEWED');
    r = await call('PUT', `/groups/${gid}/my-membership/auto-renew`, token(b), { autoRenew: false });
    check('ya pagado, no puede apagar la renovación', r.status === 400 && /Ya pagaste tu renovación/.test(JSON.stringify(r.body)));
    check(`${admin.name} sube su comprobante`, (await receipt(gid, A)).status === 201);
    r = await call('PUT', `/groups/${gid}/my-membership/auto-renew`, A, { autoRenew: false });
    check('con comprobante en revisión tampoco puede apagarla', r.status === 400);
    r = await call('PUT', `/groups/${gid}/payments/${cAdmin2.id}/review`, S, { approve: true });
    check('el vendedor lo aprueba', r.status === 200);
    check('las renovaciones generan ganancia como cualquier pago (4 + 2)', (await prisma.earningEntry.count({ where: { groupId: gid } })) === 6);

    console.log(`\n[7] ${a.name} cambia de opinión y renueva`);
    r = await call('PUT', `/groups/${gid}/my-membership/auto-renew`, token(a), { autoRenew: true });
    check('la enciende y se le genera su cobro', r.status === 200 && !!(await charge(a)));
    check('la reserva del otro comprador se cancela', (await mem(d)).status === 'CANCELLED');
    check('el comprador y el vendedor reciben el aviso', !!(await prisma.notification.findFirst({ where: { userId: d.id, groupId: gid, payload: { contains: 'ya no se liberará' } } })) && !!(await prisma.notification.findFirst({ where: { userId: seller.id, groupId: gid, payload: { contains: 'se canceló la reserva' } } })));
    check('el lugar deja de ofrecerse', !(await listed(d)));
    r = await call('PUT', `/groups/${gid}/my-membership/auto-renew`, token(a), { autoRenew: false });
    check('la apaga otra vez: se retira su cobro y el lugar vuelve al marketplace', r.status === 200 && !(await charge(a)) && !!(await listed(d)));
    r = await call('POST', `/groups/${gid}/join`, token(d), {});
    check('el otro comprador lo vuelve a apartar', r.status === 201 && r.body.status === 'RESERVED');

    console.log('\n[8] Llega el corte');
    await travel(gid, 2.5 * DAY + 2 * HOUR);
    await daily();
    const ma = await mem(a), md = await mem(d), mc = await mem(c);
    check('quien no renovó sale y su perfil queda libre', ma.status === 'CANCELLED' && (await prisma.groupProfile.count({ where: { groupId: gid, assignedMembershipId: ma.id } })) === 0);
    check('quien apartó pasa a "esperando pago"', md.status === 'PENDING_PAYMENT');
    const pd = await prisma.payment.findFirst({ where: { membershipId: md.id } });
    check('con cobro del ciclo completo y ~48 horas para pagar', !!pd && Number(pd.amount) === 80 && pd.graceUntil.getTime() - Date.now() > 46 * HOUR && pd.graceUntil.getTime() - Date.now() <= 48 * HOUR + 60_000);
    check('recibe el aviso "se liberó el lugar"', !!(await prisma.notification.findFirst({ where: { userId: d.id, groupId: gid, payload: { contains: 'Se liberó el lugar' } } })));
    check('quien no ha pagado sigue activo mientras corre su gracia', mc.status === 'ACTIVE');
    g = await groupDto();
    check('el grupo queda con 3 ocupados y deja de estar lleno', g.occupiedSlots === 3 && g.status === 'ACTIVE', `${g.occupiedSlots} ${g.status}`);

    console.log('\n[9] El nuevo comprador paga');
    check('sube su comprobante', (await receipt(gid, token(d))).status === 201);
    const freeProfile = (await prisma.groupProfile.findMany({ where: { groupId: gid, assignedMembershipId: null }, orderBy: { label: 'asc' } }))[0];
    r = await call('PUT', `/groups/${gid}/payments/${pd.id}/review`, S, { approve: true, profileId: freeProfile.id });
    check('el vendedor lo aprueba con el perfil que quedó libre', r.status === 200 && (await mem(d)).status === 'ACTIVE');
    g = await groupDto();
    check('el grupo vuelve a estar lleno', g.occupiedSlots === 4 && g.status === 'FULL');

    console.log('\n[10] Pasan las 48 horas de gracia');
    await travel(gid, 48 * HOUR);
    await daily();
    const mc2 = await mem(c);
    check('quien no pagó pierde su lugar', mc2.status === 'CANCELLED');
    check('su cobro queda como fallido', (await prisma.payment.findFirst({ where: { membershipId: mc2.id, forNextCycle: true } })).status === 'FAILED');
    check('recibe el aviso de membresía cancelada', !!(await prisma.notification.findFirst({ where: { userId: c.id, groupId: gid, type: 'MEMBERSHIP_CANCELLED' } })));
    const cycles = await prisma.billingCycle.findMany({ where: { groupId: gid }, orderBy: { periodStart: 'asc' } });
    check('el ciclo se cerró y abrió el siguiente', cycles.length === 2 && cycles[0].status === 'CLOSED' && cycles[1].status === 'OPEN');
    const stayed = await Promise.all([b, admin, d].map(mem));
    check('los que pagaron siguen activos con el nuevo periodo', stayed.every((m) => m.status === 'ACTIVE' && m.currentPeriodEnd.getTime() === cycles[1].periodEnd.getTime()));
    check('a quien ya pagó por adelantado no se le cobra otra vez', (await prisma.payment.count({ where: { billingCycleId: cycles[1].id, status: 'PENDING' } })) === 0);
    g = await groupDto();
    check('queda 1 lugar libre que se puede tomar hoy', g.occupiedSlots === 3 && g.freeSlots === 1 && g.canJoinNow === true);
  },
};
