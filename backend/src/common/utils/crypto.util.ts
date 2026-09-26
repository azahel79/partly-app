import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado para GCM

/**
 * Cifra un texto plano con AES-256-GCM. El resultado empaqueta iv y authTag junto con
 * el texto cifrado (todo en hex, separado por ":") para poder descifrarlo después sin
 * guardar esos valores en columnas aparte.
 */
export function encrypt(plainText: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/** Revierte `encrypt`. Lanza si el paquete está corrupto o la llave no coincide (authTag inválido). */
export function decrypt(payload: string, hexKey: string): string {
  const [ivHex, authTagHex, ciphertextHex] = payload.split(':');
  const key = Buffer.from(hexKey, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const plainText = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plainText.toString('utf8');
}
