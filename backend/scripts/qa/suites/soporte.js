/* Soporte: quién puede cerrar, mensajes privados con Partly, "pedir respuesta" y seguimiento automático al vendedor. */
const path = require('path');
const { BACKEND, HOUR, prisma, token, call, buildGroup } = require('../lib');

const TAG = 'QA-SOPORTE';

module.exports = {
  title: 'Soporte: privados, pedir respuesta y seguimiento',
  async run(run) {
    const { check } = run;
    const [a, b] = run.buyers;
    const S = token(run.seller), A = token(run.admin), B = token(a);
    const incidents = run.nest.get(require(path.join(BACKEND, 'dist/modules/support/incidents.service.js')).IncidentsService);
    const gid = await buildGroup(run, { name: 'Soporte', price: 60, slots: 2, members: [a, b] });
    const membership = await prisma.groupMembership.findFirst({ where: { groupId: gid, userId: a.id } });
    const open = async (subject) =>
      (await call('POST', '/incidents', B, { context: 'GROUP_MEMBERSHIP', groupMembershipId: membership.id, subject: `${TAG} ${subject}`, message: 'No tengo acceso.' })).body.id;

    try {
      console.log('\n[1] Quién puede cerrar y mensajes privados');
      const i1 = await open('privados');
      let r = await call('PUT', `/incidents/${i1}/status`, S, { status: 'RESOLVED' });
      check('el vendedor no puede cerrar el reporte (solo quien reportó)', r.status === 403);
      r = await call('POST', `/incidents/${i1}/messages`, S, { body: 'privado antes de tiempo', audience: 'ASSIGNEE' });
      check('antes de que Partly intervenga, nadie le escribe en privado', r.status === 400);
      check('solo el admin puede pedir respuesta', (await call('POST', `/incidents/${i1}/request-response`, S, {})).status === 403);
      r = await call('POST', `/incidents/${i1}/request-response`, A, {});
      check('el admin pide respuesta y el vendedor tiene 24 horas', r.status === 201 && !!r.body.responseDueAt);
      check('el admin le escribe en privado al vendedor', (await call('POST', `/incidents/${i1}/messages`, A, { body: 'Aloy, ¿qué pasó?', audience: 'ASSIGNEE' })).status === 201);
      check('el comprador no puede mandarle un privado al vendedor', (await call('POST', `/incidents/${i1}/messages`, B, { body: 'x', audience: 'ASSIGNEE' })).status === 403);
      check('el vendedor le contesta en privado a Partly', (await call('POST', `/incidents/${i1}/messages`, S, { body: 'No ha pagado completo', audience: 'ASSIGNEE' })).status === 201);
      const seen = async (tok) => (await call('GET', `/incidents/${i1}/messages`, tok)).body.length;
      check('el comprador no ve los mensajes privados', (await seen(B)) === 1);
      check('el vendedor ve los suyos y el admin todo', (await seen(S)) === 3 && (await seen(A)) === 3);
      const answered = await prisma.incident.findUnique({ where: { id: i1 } });
      check('al contestar el vendedor se cumple el pedido de respuesta', answered.responseDueAt === null && answered.status === 'IN_REVIEW');

      console.log('\n[2] Plazo vencido y seguimiento automático');
      const i2 = await open('sin respuesta');
      await call('POST', `/incidents/${i2}/request-response`, A, {});
      await prisma.incident.update({ where: { id: i2 }, data: { responseDueAt: new Date(Date.now() - 60_000) } });
      await incidents.processFollowUps();
      const toAdmin = await prisma.notification.findFirst({ where: { userId: run.admin.id, AND: [{ payload: { contains: `${TAG} sin respuesta` } }, { payload: { contains: 'no respondió a tiempo' } }] } });
      check('vencido el plazo, se le avisa al admin', !!toAdmin);

      const i3 = await open('seguimiento');
      await prisma.incident.update({ where: { id: i3 }, data: { createdAt: new Date(Date.now() - 25 * HOUR) } });
      await incidents.processFollowUps();
      await incidents.processFollowUps();
      const reminders = await prisma.notification.count({ where: { userId: run.seller.id, payload: { contains: 'Tienes un reporte sin responder' } } });
      check('a las 24 h sin respuesta se le recuerda al vendedor (una sola vez)', reminders === 1);
      await prisma.incident.update({ where: { id: i3 }, data: { createdAt: new Date(Date.now() - 73 * HOUR) } });
      await incidents.processFollowUps();
      check('a las 72 h sin respuesta se escala sola a Partly', (await prisma.incident.findUnique({ where: { id: i3 } })).status === 'ESCALATED');

      const i4 = await open('contestada');
      await call('POST', `/incidents/${i4}/messages`, S, { body: 'Ya lo reviso' });
      await prisma.incident.update({ where: { id: i4 }, data: { createdAt: new Date(Date.now() - 80 * HOUR) } });
      await incidents.processFollowUps();
      const i4State = await prisma.incident.findUnique({ where: { id: i4 } });
      check('si el vendedor ya contestó, ni recordatorio ni escalada', i4State.status === 'IN_REVIEW' && i4State.followUpStage === 0);
    } finally {
      // Los avisos a admins (reales incluidos) no llevan grupo: se borran por la etiqueta de la prueba.
      await prisma.notification.deleteMany({ where: { payload: { contains: TAG } } });
      await prisma.emailMessage.deleteMany({ where: { subject: { contains: TAG } } });
    }
  },
};
