/* Seguridad: datos privados del vendedor, grupos sin aprobar, acceso del admin a credenciales y validación de comprobantes. */
const { API, prisma, token, call, receipt, createApprovedGroup, buildGroup } = require('../lib');

module.exports = {
  title: 'Seguridad',
  async run(run) {
    const { check, admin, seller } = run;
    const [a, b, c, d] = run.buyers;
    const S = token(seller), A = token(admin);
    const anon = async (route) => { const r = await fetch(API + route); return { status: r.status, body: r.status < 300 ? await r.json() : null }; };

    console.log('\n[1] Cuenta bancaria y comisión del vendedor');
    const gid = await buildGroup(run, { name: 'Seguridad pública', price: 50, slots: 2, members: [a, b] });
    let r = await anon(`/groups/${gid}`);
    check('sin sesión: el detalle no trae la cuenta bancaria ni la comisión', r.status === 200 && r.body.bankAccountNumber === null && r.body.commissionPercentage === null);
    r = await call('GET', `/groups/${gid}`, token(d));
    check('un usuario sin relación con el grupo tampoco la ve', r.status === 200 && r.body.bankAccountNumber === null);
    r = await call('GET', `/groups/${gid}`, token(a));
    check('un miembro activo ve la cuenta (paga renovaciones) pero no la comisión', !!r.body.bankAccountNumber && r.body.commissionPercentage === null);
    r = await call('GET', `/groups/${gid}`, S);
    check('el vendedor ve su cuenta y su comisión', !!r.body.bankAccountNumber && !!r.body.commissionPercentage);
    r = await call('GET', `/groups/${gid}`, A);
    check('un admin ve ambas', !!r.body.bankAccountNumber && !!r.body.commissionPercentage);
    r = await call('GET', '/groups?limit=100', token(d));
    check('el marketplace no trae cuentas bancarias ni comisiones de nadie', r.status === 200 && r.body.data.every((g) => g.bankAccountNumber === null && g.commissionPercentage === null));
    check('un token inválido recibe 401 (para que el frontend renueve la sesión)', (await call('GET', `/groups/${gid}`, 'token.invalido.x')).status === 401);

    console.log('\n[2] Grupos sin aprobar');
    const created = await call('POST', '/groups', S, { platformName: 'Spotify', tierName: 'QA Seguridad revisión', maxSlots: 3, officialPrice: 120, pricePerSlot: 40, availableSlots: 2, bankAccountNumber: '646180112345678901' });
    const pending = run.track(created.body.id);
    check('sin sesión: un grupo en revisión no existe (404)', (await anon(`/groups/${pending}`)).status === 404);
    check('otro usuario tampoco lo ve', (await call('GET', `/groups/${pending}`, token(d))).status === 404);
    check('el vendedor y el admin sí lo ven', (await call('GET', `/groups/${pending}`, S)).status === 200 && (await call('GET', `/groups/${pending}`, A)).status === 200);

    console.log('\n[3] El admin y las credenciales');
    check('en un grupo aprobado donde no es miembro, el admin no puede leer la contraseña', (await call('GET', `/groups/${gid}/credential`, A)).status === 403);
    await call('PUT', `/groups/${pending}/commission`, A, { commissionPercentage: 10 });
    await call('POST', `/groups/${pending}/request-credentials`, A, {});
    await call('PUT', `/groups/${pending}/credential`, S, { username: 'seg@partly.test', password: 'Secreta123' });
    r = await call('GET', `/groups/${pending}/credential`, A);
    check('mientras las revisa sí puede verlas', r.status === 200 && r.body.username === 'seg@partly.test');
    check('y la consulta queda en la bitácora', !!(await prisma.adminActionLog.findFirst({ where: { actionType: 'CREDENTIAL_VIEWED', targetId: pending } })));
    await call('PUT', `/groups/${pending}/approval`, A, { status: 'APPROVED' });
    check('ya aprobado, pierde el acceso', (await call('GET', `/groups/${pending}/credential`, A)).status === 403);

    console.log('\n[4] Comprobantes: se revisa el contenido real');
    for (const u of [c, d]) await call('POST', `/groups/${pending}/join`, token(u), {});
    await call('POST', `/groups/${pending}/start`, S, {});
    r = await receipt(pending, token(c), '<html><script>alert(1)</script></html>', 'application/pdf', 'comprobante.pdf');
    check('una página web disfrazada de PDF se rechaza', r.status === 400);
    r = await receipt(pending, token(c), Buffer.from('GIF89a...'), 'image/png', 'captura.png');
    check('un archivo que no es PNG aunque diga image/png se rechaza', r.status === 400);
    r = await receipt(pending, token(c), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), 'image/png', 'captura.png');
    check('un PNG real se acepta', r.status === 201);
    check('un PDF real se acepta', (await receipt(pending, token(d))).status === 201);
  },
};
