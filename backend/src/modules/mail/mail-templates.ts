/**
 * Plantillas de correo: una sola estructura visual (encabezado de marca, tarjeta, botón,
 * pie con enlace a las preferencias) y el contenido de cada aviso encima. HTML con tablas y
 * estilos en línea porque es lo único que se ve igual en todos los clientes de correo.
 */

export interface EmailContent {
  /** Título grande del correo. */
  title: string;
  /** Texto corto que se ve en la bandeja junto al asunto. */
  preheader?: string;
  /** Saludo, ej. "Hola Ana,". */
  greeting?: string;
  paragraphs: string[];
  /** Dato destacado en una caja (ej. el monto). */
  highlight?: { label: string; value: string };
  cta?: { label: string; url: string };
  /** Nota chica debajo del botón. */
  note?: string;
}

export interface RenderContext {
  appUrl: string;
  /** Enlace para administrar los avisos (se omite en correos obligatorios como el de la contraseña). */
  prefsUrl?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

const BRAND = '#059669';
const INK = '#111735';
const MUTED = '#59627c';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmail(content: EmailContent, ctx: RenderContext): RenderedEmail {
  const paragraphs = content.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(p)}</p>`)
    .join('');

  const highlight = content.highlight
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr><td style="background:#f0faf7;border:1px solid #cdeee2;border-radius:12px;padding:14px 16px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BRAND};">${escapeHtml(content.highlight.label)}</div>
        <div style="font-size:24px;font-weight:800;color:${INK};margin-top:2px;">${escapeHtml(content.highlight.value)}</div>
      </td></tr></table>`
    : '';

  const cta = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;"><tr><td style="border-radius:10px;background:${BRAND};">
        <a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(content.cta.label)}</a>
      </td></tr></table>`
    : '';

  const note = content.note ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#7c859c;">${escapeHtml(content.note)}</p>` : '';

  const footerPrefs = ctx.prefsUrl
    ? `Recibes este correo porque tienes una cuenta en Vakeva. <a href="${escapeHtml(ctx.prefsUrl)}" style="color:${BRAND};text-decoration:underline;">Administra tus avisos</a> cuando quieras.`
    : 'Recibes este correo porque tienes una cuenta en Vakeva.';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader ?? content.title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:28px 12px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 14px;"><a href="${escapeHtml(ctx.appUrl)}" style="font-size:24px;font-weight:900;letter-spacing:-.02em;color:${INK};text-decoration:none;">vakeva<span style="color:${BRAND};">.</span></a></td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e6eaf0;border-radius:16px;padding:30px 28px;">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:800;color:${INK};">${escapeHtml(content.title)}</h1>
      ${content.greeting ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(content.greeting)}</p>` : ''}
      ${paragraphs}
      ${highlight}
      ${cta}
      ${note}
    </td></tr>
    <tr><td style="padding:16px 8px 0;font-size:12px;line-height:1.6;color:#7c859c;text-align:center;">${footerPrefs}<br>© Vakeva · Suscripciones compartidas seguras</td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = [
    content.title,
    '',
    content.greeting ?? '',
    ...content.paragraphs,
    content.highlight ? `${content.highlight.label}: ${content.highlight.value}` : '',
    content.cta ? `${content.cta.label}: ${content.cta.url}` : '',
    content.note ?? '',
    '',
    ctx.prefsUrl ? `Administra tus avisos: ${ctx.prefsUrl}` : '',
    '— Vakeva',
  ]
    .filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== ''))
    .join('\n')
    .trim();

  return { html, text };
}

/** Primer nombre para el saludo ("Hola Ana,"). */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || '';
}
