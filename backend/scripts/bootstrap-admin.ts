import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const confirmed = process.argv.includes('--confirm');

  if (!email || !confirmed) {
    throw new Error(
      'Uso: define BOOTSTRAP_ADMIN_EMAIL y ejecuta `npm run admin:bootstrap -- --confirm`.',
    );
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, deletedAt: null },
    select: { id: true },
  });
  if (existingAdmin) {
    throw new Error('Ya existe un administrador activo. Asigna roles desde el panel administrativo.');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) {
    throw new Error(`No existe una cuenta activa con el correo ${email}. Regístrala primero.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: Role.ADMIN } });
    await tx.adminActionLog.create({
      data: {
        adminUserId: user.id,
        actionType: 'BOOTSTRAP_ADMIN',
        targetEntity: 'User',
        targetId: user.id,
        reason: 'Primer administrador creado mediante script de bootstrap.',
      },
    });
  });

  console.log(`Administrador inicial configurado: ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
