/** Claves de institución (los últimos tres dígitos del catálogo SPEI de Banco de México). */
export const CLABE_BANKS: Readonly<Record<string, string>> = {
  '002': 'Banamex', '006': 'Bancomext', '009': 'Banobras', '012': 'BBVA México', '014': 'Santander',
  '019': 'Banjército', '021': 'HSBC', '030': 'Banco del Bajío', '036': 'Inbursa', '042': 'Mifel',
  '044': 'Scotiabank', '058': 'Banregio', '059': 'Invex', '060': 'Bansi', '062': 'Afirme',
  '072': 'Banorte', '106': 'Bank of America', '108': 'MUFG', '110': 'JP Morgan', '112': 'BMonex',
  '113': 'Ve por Más', '124': 'Citi México', '127': 'Banco Azteca', '128': 'Kapital Bank',
  '129': 'Barclays', '130': 'Compartamos', '132': 'Banco Multiva', '133': 'Actinver', '135': 'Nafin',
  '136': 'Intercam Banco', '137': 'BanCoppel', '138': 'Ualá', '140': 'Consubanco', '141': 'Volkswagen Bank',
  '145': 'BBase', '147': 'Bankaool', '148': 'PagaTodo', '150': 'Banco Inmobiliario Mexicano', '151': 'Dondé',
  '152': 'Bancrea', '154': 'Banco Covalto', '155': 'ICBC', '156': 'Sabadell', '157': 'Shinhan',
  '158': 'Mizuho Bank', '159': 'Bank of China', '160': 'Banco S3', '167': 'Hey Banco', '170': 'Revolut Bank',
  '171': 'Banco Plata', '600': 'Monex Casa de Bolsa', '601': 'GBM', '602': 'Masari', '605': 'Value',
  '616': 'Finamex', '617': 'Valmex', '620': 'Profuturo', '631': 'TRF', '634': 'Fincomún',
  '638': 'Nu México', '646': 'STP', '652': 'Credicapital', '653': 'Kuspit', '656': 'Unagra',
  '659': 'ASP Integra', '660': 'Altor', '661': 'Klar', '670': 'Libertad', '677': 'Caja Popular Mexicana',
  '680': 'Caja Cristóbal Colón', '683': 'Caja Telefonistas', '684': 'Transfer', '685': 'Fondo FIRA',
  '688': 'CrediClub', '699': 'Fondeadora', '703': 'Tesored', '706': 'Arcus FI', '710': 'NVIO',
  '714': 'PPBalanceMX', '715': 'Cashi', '720': 'MexPago', '721': 'Albo', '722': 'Mercado Pago',
  '723': 'Cuenca', '725': 'Coopdesarrollo', '727': 'Transfer Direct', '728': 'Spin by OXXO',
  '729': 'Depósitos y Pagos Digitales', '730': 'Clip', '732': 'Peibo', '734': 'Finco Pay', '738': 'Fintoc',
};

export interface ClabeInfo {
  digits: string;
  bankCode: string | null;
  bankName: string | null;
  isComplete: boolean;
  isValid: boolean;
}

export function inspectClabe(value: string): ClabeInfo {
  const digits = value.replace(/\D/g, '').slice(0, 18);
  const bankCode = digits.length >= 3 ? digits.slice(0, 3) : null;
  const bankName = bankCode ? CLABE_BANKS[bankCode] ?? null : null;
  const isComplete = digits.length === 18;
  let isValid = false;

  if (isComplete && !/^(\d)\1+$/.test(digits)) {
    const weights = [3, 7, 1];
    const sum = digits
      .slice(0, 17)
      .split('')
      .reduce((total, digit, index) => total + ((Number(digit) * weights[index % 3]) % 10), 0);
    const verifier = (10 - (sum % 10)) % 10;
    isValid = verifier === Number(digits[17]);
  }

  return { digits, bankCode, bankName, isComplete, isValid };
}
