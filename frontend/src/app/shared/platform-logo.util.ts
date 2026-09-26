/**
 * Logos reales de las plataformas (carpeta public/logos). Se detectan por el nombre que
 * escribió quien creó la plataforma, así "PRIME  VIDEO", "prime video" y "Amazon Prime"
 * apuntan al mismo logo sin tener que subirlo a mano.
 */
const LOGO_RULES: Array<{ file: string; test: RegExp }> = [
  { file: 'netflix', test: /\bnetflix\b/ },
  { file: 'disney', test: /\bdisney\b/ },
  { file: 'max', test: /\b(hbo|max)\b/ },
  { file: 'paramount', test: /\bparamount\b/ },
  { file: 'primevideo', test: /\b(prime|amazon)\b/ },
  { file: 'spotify', test: /\bspotify\b/ },
  { file: 'youtube', test: /\b(youtube|you tube)\b/ },
  { file: 'crunchyroll', test: /\bcrunchyroll\b/ },
  { file: 'canva', test: /\bcanva\b/ },
  { file: 'chatgpt', test: /\b(chatgpt|chat gpt|openai)\b/ },
  { file: 'gemini', test: /\bgemini\b/ },
  { file: 'appletv', test: /\b(apple ?tv|appletv)\b/ },
  { file: 'viki-rakuten', test: /\b(viki|rakuten)\b/ },
  { file: 'vix', test: /\bvix\b/ },
];

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ruta del logo local que corresponde al nombre de la plataforma, o null si no hay uno. */
export function platformLogoSrc(platformName: string | null | undefined): string | null {
  if (!platformName) {
    return null;
  }
  const normalized = normalize(platformName);
  const rule = LOGO_RULES.find((r) => r.test.test(normalized));
  return rule ? `/logos/${rule.file}.png` : null;
}
