import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/** Deja solo letras/números/guiones, sin acentos ni espacios — para que el nombre de archivo sea legible y seguro. */
function sanitizeForFilename(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * Nombre pedido: nombre_fecha_plataforma (ej. "juan-perez_20261014_netflix.pdf"). Se le
 * agrega un sufijo corto para no pisar el archivo de otro pago con el mismo nombre/fecha/
 * plataforma (ej. dos comprobantes el mismo día para el mismo servicio).
 */
export function buildReceiptFilename(userName: string, platformName: string, date: Date, extension: string): string {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const uniquePart = randomUUID().slice(0, 8);
  return `${sanitizeForFilename(userName)}_${datePart}_${sanitizeForFilename(platformName)}_${uniquePart}${extension}`;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Revisa que el contenido del archivo corresponda al tipo que declaró el navegador (los primeros bytes de un JPG,
 * PNG, WEBP o PDF real), para no guardar ni servir archivos disfrazados de comprobante.
 */
export function receiptMatchesType(buffer: Buffer, mimetype: string): boolean {
  switch (mimetype) {
    case 'image/jpeg':
      return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return buffer.length > 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
    case 'image/webp':
      return buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    case 'application/pdf':
      // La especificación permite basura antes del encabezado, pero siempre dentro del primer kilobyte.
      return buffer.subarray(0, 1024).includes('%PDF-');
    default:
      return false;
  }
}

/** Guarda el buffer bajo <dir>/<filename> (crea el directorio si no existe) y regresa la ruta relativa guardada en DB. */
export async function saveReceiptFile(dir: string, filename: string, buffer: Buffer): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return filename;
}

/** Borra el archivo si existe; no truena si ya no está (ej. limpieza que corre dos veces). */
export async function deleteReceiptFile(dir: string, relativePath: string): Promise<void> {
  try {
    await fs.unlink(path.join(dir, relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/** Ruta absoluta (aunque `dir` venga relativo, ej. desde .env) — la necesita res.sendFile(). */
export function resolveReceiptPath(dir: string, relativePath: string): string {
  return path.resolve(dir, relativePath);
}
