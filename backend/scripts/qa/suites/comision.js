/* Comisión vencida: el vendedor queda restringido, se avisa a quien apartó cupo en un grupo detenido y todo vuelve al pagar. */
const { DAY, prisma, token, call, createApprovedGroup } = require('../lib');

module.exports = {
  title: 'Comisión vencida y grupos detenidos',
  async run(run) {
    const { check, admin, seller } = run;
    const [, , , d] = run.buyers;
    const S = token(seller), A = token(admin);
    const settings = await prisma.platformSettings.findFirst();
    if (!settings?.bankClabe) {
      console.log('  (sin cuenta bancaria de Tequio configurada no se restringe a nadie: se omite esta prueba)');
      return;
    }
    if ((await call('GET', '/commissions/status', S)).body?.restricted) {
      console.log('  (el vendedor de prueba ya tiene una comisión vencida real: se omite para no alterarla)');
      return;
    }

    const gid = await createApprovedGroup(run, { name: 'Comisión', price: 50, slots: 4 });
    check('un comprador aparta cupo en el grupo (sin iniciar)', (await call('POST', `/groups/${gid}/join`, token(d), {})).body?.status === 'RESERVED');
    const charge = await prisma.commissionCharge.create({ data: { sellerId: seller.id, amount: 40, status: 'PENDING', dueAt: new Date(Date.now() - 9 * DAY), payBy: new Date(Date.now() - 2 * DAY) } });
    await run.services.commissions().processDaily();

    const created = await call('POST', '/groups', S, { platformName: 'Spotify', tierName: 'QA Comisión bloqueado', maxSlots: 3, officialPrice: 100, pricePerSlot: 30, availableSlots: 2 });
    if (created.status < 300) run.track(created.body.id);
    check('con la comisión vencida no puede crear grupos', created.status === 403);
    const market = (await call('GET', '/groups?limit=100', token(d))).body.data;
    check('sus grupos salen del marketplace', !market.some((g) => g.owner.id === seller.id));
    const halted = await prisma.notification.findFirst({ where: { userId: d.id, groupId: gid, payload: { contains: 'está detenido' } } });
    check('quien apartó cupo recibe el aviso de grupo detenido (sin costo)', !!halted && /sin costo/.test(halted.payload));
    await run.services.commissions().processDaily();
    check('el aviso no se repite', (await prisma.notification.count({ where: { userId: d.id, groupId: gid, payload: { contains: 'está detenido' } } })) === 1);

    await prisma.commissionCharge.update({ where: { id: charge.id }, data: { status: 'IN_REVIEW', receiptPath: 'qa-comision.pdf', receiptUploadedAt: new Date() } });
    const r = await call('PUT', `/admin/commissions/${charge.id}/review`, A, { approve: true });
    check('el admin aprueba el pago', r.status === 200);
    check('quien apartó recibe el aviso de que ya se puede iniciar', !!(await prisma.notification.findFirst({ where: { userId: d.id, groupId: gid, payload: { contains: 'ya quedó al corriente' } } })));
    check('el vendedor deja de estar restringido', (await call('GET', '/commissions/status', S)).body?.restricted === false);
    await prisma.adminActionLog.deleteMany({ where: { targetId: charge.id } });
    await prisma.commissionCharge.delete({ where: { id: charge.id } });
  },
};
