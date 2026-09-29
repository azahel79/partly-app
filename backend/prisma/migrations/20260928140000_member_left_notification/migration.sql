-- Aviso al vendedor cuando sale alguien que ya tenía acceso: debe cambiar la contraseña de la cuenta.
ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_LEFT';
