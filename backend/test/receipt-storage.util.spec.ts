import { receiptMatchesType } from '../src/common/utils/receipt-storage.util';

describe('receiptMatchesType', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

  it('acepta archivos cuyo contenido coincide con el tipo declarado', () => {
    expect(receiptMatchesType(png, 'image/png')).toBe(true);
    expect(receiptMatchesType(jpg, 'image/jpeg')).toBe(true);
    expect(receiptMatchesType(webp, 'image/webp')).toBe(true);
    expect(receiptMatchesType(Buffer.from('%PDF-1.7\n...'), 'application/pdf')).toBe(true);
  });

  it('acepta un PDF con bytes antes del encabezado (dentro del primer kilobyte)', () => {
    expect(receiptMatchesType(Buffer.concat([Buffer.alloc(40, 0x20), Buffer.from('%PDF-1.4')]), 'application/pdf')).toBe(true);
  });

  it('rechaza archivos disfrazados de otro tipo', () => {
    expect(receiptMatchesType(Buffer.from('<html><script>alert(1)</script></html>'), 'application/pdf')).toBe(false);
    expect(receiptMatchesType(jpg, 'image/png')).toBe(false);
    expect(receiptMatchesType(png, 'image/jpeg')).toBe(false);
    expect(receiptMatchesType(Buffer.from('GIF89a'), 'image/webp')).toBe(false);
  });

  it('rechaza tipos que no son comprobantes válidos', () => {
    expect(receiptMatchesType(Buffer.from('<svg/>'), 'image/svg+xml')).toBe(false);
    expect(receiptMatchesType(Buffer.alloc(0), 'image/png')).toBe(false);
  });
});
