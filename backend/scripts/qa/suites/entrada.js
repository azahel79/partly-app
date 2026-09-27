/* Entrada a un grupo ya iniciado: se paga solo lo que resta y se exige un mínimo de días. Además, un comprobante subido protege el lugar. */
const { DAY, HOUR, prisma, token, call, receipt, travel, setCycleEndIn, buildGroup } = require('../lib');

module.exports = {
  title: 'Entrada a mitad de ciclo y gracia con comprobante',
  async run(run) {
    const { check } = run;
    const [a, b, c, d] = run.buyers;
    const daily = () => run.services.payments().processDailyBilling();

    console.log('\n[1] Grupo iniciado de 4 lugares con 3 miembros');
    const gid = await buildGroup(run, { name: 'Entrada', price: 60, slots: 4, members: [a, b, c] });
    const preview = async () => (await call('GET', `/groups/${gid}/join-preview`, token(d))).body;
    const expected = (p) => Math.min(60, Math.ceil((60 * p.remainingDays) / p.totalDays));

    await setCycleEndIn(gid, 20 * DAY);
    let p = await preview();
    check('con 20 días restantes puede entrar y paga solo esos días', p.canJoinNow === true && p.remainingDays === 20 && p.amountToPay === expected(p), `$${p.amountToPay} de $60 (${p.remainingDays}/${p.totalDays} días)`);
    await setCycleEndIn(gid, 15 * DAY);
    p = await preview();
    check('con 15 días justos todavía puede entrar', p.canJoinNow === true && p.amountToPay === expected(p), `$${p.amountToPay}`);
    await setCycleEndIn(gid, 10 * DAY);
    p = await preview();
    check('con 10 días ya no puede entrar (mínimo 15)', p.canJoinNow === false && p.minEntryDays === 15);
    const r = await call('POST', `/groups/${gid}/join`, token(d), {});
    check('el servidor rechaza el intento y explica cuándo podrá', r.status === 400 && /renueva en 10 días/.test(JSON.stringify(r.body)));

    console.log('\n[2] Renovación: un comprobante subido protege el lugar');
    await setCycleEndIn(gid, 2.5 * DAY);
    await daily();
    check(`${a.name} sube su comprobante y el vendedor no lo revisa`, (await receipt(gid, token(a))).status === 201);
    await setCycleEndIn(gid, -2 * HOUR);
    await travel(gid, 48 * HOUR);
    await daily();
    const status = async (u) => (await prisma.groupMembership.findFirst({ where: { groupId: gid, userId: u.id }, orderBy: { joinedAt: 'desc' } })).status;
    check('pasada la gracia conserva su lugar (pago en revisión)', (await status(a)) === 'ACTIVE');
    check('quienes no subieron nada pierden el suyo', (await status(b)) === 'CANCELLED' && (await status(c)) === 'CANCELLED');
  },
};
