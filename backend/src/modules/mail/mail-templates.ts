import { EMAIL_LOGO_HEIGHT, EMAIL_LOGO_WIDTH } from './mail-logo';

/**
 * Plantillas de correo: una sola estructura visual (tarjeta con el logo de Partly, título, texto, botón y pie con
 * enlace a las preferencias) y el contenido de cada aviso encima. HTML con tablas y estilos en línea porque es lo
 * único que se ve igual en todos los clientes de correo.
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
  /** URL de la imagen del logo (el transporte SMTP la cambia por una adjunta si no es pública). */
  logoUrl: string;
  /** Enlace para administrar los avisos (se omite en correos obligatorios como el de la contraseña). */
  prefsUrl?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

const BRAND = '#059669';
const ACTION = '#047857';
const INK = '#111735';
const TEXT = '#4a5470';
const SOFT = '#7c859c';
const LINE = '#e6eaf0';
const PAGE = '#f3f5f8';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${TEXT};">${escapeHtml(p)}</p>`)
    .join('');

  const highlight = content.highlight
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;"><tr><td style="background:#f0faf6;border:1px solid #cdeee2;border-radius:12px;padding:16px 18px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BRAND};">${escapeHtml(content.highlight.label)}</div>
        <div style="font-size:26px;font-weight:800;color:${INK};margin-top:4px;">${escapeHtml(content.highlight.value)}</div>
      </td></tr></table>`
    : '';

  const cta = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td style="border-radius:12px;background:${ACTION};">
        <a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(content.cta.label)} &rarr;</a>
      </td></tr></table>`
    : '';

  const note = content.note
    ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${LINE};font-size:13px;line-height:1.55;color:${SOFT};word-break:break-word;">${escapeHtml(content.note)}</p>`
    : '';

  const footerPrefs = ctx.prefsUrl
    ? `Recibes este correo porque tienes una cuenta en Partly.<br><a href="${escapeHtml(ctx.prefsUrl)}" style="color:${SOFT};text-decoration:underline;">Administra tus avisos</a>`
    : 'Recibes este correo porque tienes una cuenta en Partly.';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.title)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader ?? content.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};padding:32px 12px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:18px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="height:5px;line-height:5px;font-size:0;background:${BRAND};border-radius:18px 18px 0 0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 32px 20px;border-bottom:1px solid ${LINE};">
          <a href="${escapeHtml(ctx.appUrl)}" style="text-decoration:none;"><img src="${escapeHtml(ctx.logoUrl)}" width="${EMAIL_LOGO_WIDTH}" height="${EMAIL_LOGO_HEIGHT}" alt="Partly" style="display:block;border:0;outline:none;width:${EMAIL_LOGO_WIDTH}px;height:${EMAIL_LOGO_HEIGHT}px;font-size:22px;font-weight:900;color:${INK};"></a>
        </td></tr>
        <tr><td style="padding:28px 32px 32px;">
          <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:800;color:${INK};">${escapeHtml(content.title)}</h1>
          ${content.greeting ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;font-weight:600;color:${INK};">${escapeHtml(content.greeting)}</p>` : ''}
          ${paragraphs}
          ${highlight}
          ${cta}
          ${note}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:22px 16px 0;font-size:12px;line-height:1.7;color:${SOFT};text-align:center;">
      ${footerPrefs}<br>
      <span style="color:#a3abbd;">Partly · Suscripciones compartidas, pagos directos y seguros</span>
    </td></tr>
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
    '— Partly',
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
