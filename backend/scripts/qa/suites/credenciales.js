/* Cuando sale alguien que ya conocía la contraseña: aviso al vendedor para cambiarla y aviso a los miembros cuando la cambia. */
const { DAY, HOUR, prisma, token, call, receipt, travel, setCycleEndIn, buildGroup } = require('../lib');

module.exports = {
  title: 'Cambio de contraseña cuando alguien sale',
  async run(run) {
    const { check } = run;
    const [a, b, c, d] = run.buyers;
    const S = token(run.seller);
    const daily = () => run.services.payments().processDailyBilling();
    const status = async (gid) => (await call('GET', `/groups/${gid}/credential-status`, S)).body;
    const memberLeft = (gid, text) =>
      prisma.notification.findFirst({ where: { userId: run.seller.id, groupId: gid, type: 'MEMBER_LEFT', payload: { contains: text } } });
    const credentialNotice = (gid, u) =>
      prisma.notification.findFirst({ where: { userId: u.id, groupId: gid, type: 'CREDENTIAL_UPDATED' }, orderBy: { createdAt: 'desc' } });

    console.log('\n[1] Alguien se sale por su cuenta');
    const gid = await buildGroup(run, { name: 'Credenciales', price: 60, slots: 3, members: [a, b, c] });
    let st = await status(gid);
    check('recién armado el grupo, no hay cambio de contraseña pendiente', st.rotationPending === false);
    check('solo el vendedor ve ese aviso', (await call('GET', `/groups/${gid}/credential-status`, token(a))).status === 403);
    check(`${b.name} sale del grupo`, (await call('POST', `/groups/${gid}/leave`, token(b), {})).status === 204);
    check('al vendedor le llega el aviso de cambiar la contraseña', !!(await memberLeft(gid, 'cambia la contraseña')));
    st = await status(gid);
    check('queda "cambio de contraseña pendiente" con el nombre de quien salió', st.rotationPending === true && st.lastMemberName === b.name && st.departures === 1);

    console.log('\n[2] El vendedor actualiza la contraseña');
    let r = await call('PUT', `/groups/${gid}/credential`, S, { username: 'qa@partly.test', password: 'Secreta123', notes: 'Usa tu perfil.' });
    check('si solo cambia las notas, a los miembros no se les avisa', r.status < 300 && !(await credentialNotice(gid, a)));
    r = await call('PUT', `/groups/${gid}/credential`, S, { username: 'qa@partly.test', password: 'NuevaClave456', changeReason: 'Salió un miembro' });
    const na = await credentialNotice(gid, a);
    const nc = await credentialNotice(gid, c);
    check('con contraseña nueva, a los miembros activos les llega el aviso con el motivo', r.status < 300 && !!na && !!nc && na.payload.includes('Salió un miembro'));
    check('el aviso no incluye la contraseña', !na.payload.includes('NuevaClave456'));
    check(`${b.name}, que ya salió, no recibe el aviso`, !(await credentialNotice(gid, b)));
    check('el miembro ve la contraseña nueva en Partly', (await call('GET', `/groups/${gid}/credential`, token(a))).body?.password === 'NuevaClave456');
    check('el aviso pendiente se quita solo', (await status(gid)).rotationPending === false);

    console.log('\n[3] Alguien no paga su renovación');
    await setCycleEndIn(gid, 2.5 * DAY);
    await daily();
    check(`${a.name} sube su comprobante; ${c.name} no paga`, (await receipt(gid, token(a))).status === 201);
    await setCycleEndIn(gid, -2 * HOUR);
    await travel(gid, 48 * HOUR);
    await daily();
    const cState = (await prisma.groupMembership.findFirst({ where: { groupId: gid, userId: c.id }, orderBy: { joinedAt: 'desc' } })).status;
    check('pasada la gracia pierde su lugar', cState === 'CANCELLED');
    check('al vendedor le llega el aviso de que no pagó y que cambie la contraseña', !!(await memberLeft(gid, 'no pagó su renovación')));
    check('vuelve a quedar el cambio de contraseña pendiente', (await status(gid)).rotationPending === true);

    console.log('\n[4] Alguien apaga la renovación y termina su periodo');
    const gid2 = await buildGroup(run, { name: 'No renueva', price: 50, slots: 2, members: [d, a] });
    check(`${d.name} apaga su renovación`, (await call('PUT', `/groups/${gid2}/my-membership/auto-renew`, token(d), { autoRenew: false })).status < 300);
    await setCycleEndIn(gid2, -1 * HOUR);
    await daily();
    const dState = (await prisma.groupMembership.findFirst({ where: { groupId: gid2, userId: d.id }, orderBy: { joinedAt: 'desc' } })).status;
    check('al terminar su periodo sale del grupo', dState === 'CANCELLED');
    check('al vendedor le llega el aviso de que no renovó y que cambie la contraseña', !!(await memberLeft(gid2, 'no renovó')));
  },
};
