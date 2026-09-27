/* Reseñas: solo con pago validado y 7 días de servicio, recordatorio único y respuesta pública del vendedor. */
const { DAY, prisma, token, call, travel, buildGroup } = require('../lib');

module.exports = {
  title: 'Reseñas y respuesta del vendedor',
  async run(run) {
    const { check, seller } = run;
    const [a, b, , d] = run.buyers;
    const S = token(seller);
    const reviews = run.services.reviews();

    const gid = await buildGroup(run, { name: 'Reseñas', price: 60, slots: 2, members: [a, b] });
    let e = (await call('GET', `/groups/${gid}/review/eligibility`, token(a))).body;
    check('recién pagó: todavía no puede reseñar y se le dice desde cuándo', e.canReview === false && /Podrás reseñar a partir del/.test(e.reason));
    check('el servidor rechaza su reseña', (await call('PUT', `/groups/${gid}/review`, token(a), { rating: 5 })).status === 400);
    check('quien nunca fue miembro no puede reseñar', (await call('PUT', `/groups/${gid}/review`, token(d), { rating: 5 })).status === 400);
    check('el vendedor no puede reseñar su propio grupo', (await call('PUT', `/groups/${gid}/review`, S, { rating: 5 })).status === 400);

    await travel(gid, 8 * DAY);
    e = (await call('GET', `/groups/${gid}/review/eligibility`, token(a))).body;
    check('a los 8 días ya puede reseñar', e.canReview === true);
    const before = await prisma.notification.count({ where: { groupId: gid, payload: { contains: 'Deja tu reseña' } } });
    await reviews.sendReviewReminders();
    const after = await prisma.notification.count({ where: { groupId: gid, payload: { contains: 'Deja tu reseña' } } });
    check('los dos miembros reciben el recordatorio', after - before === 2, `${after - before}`);
    await reviews.sendReviewReminders();
    check('el recordatorio no se repite', (await prisma.notification.count({ where: { groupId: gid, payload: { contains: 'Deja tu reseña' } } })) === after);

    let r = await call('PUT', `/groups/${gid}/review`, token(a), { rating: 5, comment: 'Todo bien' });
    check('publica su reseña', r.status === 200);
    const reviewId = r.body.id;
    check('otro comprador no puede responderla', (await call('PUT', `/groups/${gid}/reviews/${reviewId}/reply`, token(b), { reply: 'hola' })).status === 403);
    r = await call('PUT', `/groups/${gid}/reviews/${reviewId}/reply`, S, { reply: 'Gracias por tu comentario.' });
    check('el vendedor responde en público', r.status === 200 && !!r.body.sellerReplyAt);
    check('el comprador recibe el aviso de la respuesta', !!(await prisma.notification.findFirst({ where: { userId: a.id, payload: { contains: 'respondió a tu reseña' }, createdAt: { gte: run.startedAt } } })));
    r = await call('PUT', `/groups/${gid}/review`, token(a), { rating: 4, comment: 'Editada' });
    check('puede editar su reseña', r.status === 200 && r.body.rating === 4);
  },
  /** La calificación del vendedor se recalcula al borrar el grupo, pero el promedio guardado queda: se restaura. */
  async before(run) { run.sellerRating = (await prisma.user.findUnique({ where: { id: run.seller.id } })).ratingAvg; },
  async after(run) { await prisma.user.update({ where: { id: run.seller.id }, data: { ratingAvg: run.sellerRating } }); },
};
