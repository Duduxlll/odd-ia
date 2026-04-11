import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, current) => total + current, 0) / values.length;
}

export function parseDecimal(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePercentString(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const numeric = Number.parseFloat(value.replace("%", "").replace(",", "."));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric / 100;
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatOdd(value: number) {
  return value.toFixed(2);
}

export function formatDateTimeInSaoPaulo(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatDateKeyInSaoPaulo(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function getTodayDateInSaoPaulo() {
  return formatDateKeyInSaoPaulo(new Date());
}

export function getTomorrowDateInSaoPaulo() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDateKeyInSaoPaulo(tomorrow);
}

export function resolveAllowedScanDate(value?: string | null) {
  const today = getTodayDateInSaoPaulo();
  const tomorrow = getTomorrowDateInSaoPaulo();

  return value === tomorrow ? tomorrow : today;
}

export function getScanDateLabel(scanDate: string) {
  const today = getTodayDateInSaoPaulo();
  const tomorrow = getTomorrowDateInSaoPaulo();

  if (scanDate === today) {
    return "Hoje";
  }

  if (scanDate === tomorrow) {
    return "Amanhã";
  }

  return scanDate;
}

export function getScanDateLabelLower(scanDate: string) {
  const label = getScanDateLabel(scanDate);
  return label === "Hoje" ? "hoje" : label === "Amanhã" ? "amanhã" : label.toLowerCase();
}

export function getDateKeyFromIsoInSaoPaulo(value: string) {
  return formatDateKeyInSaoPaulo(new Date(value));
}

function normalizeLookupKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

const COUNTRY_DISPLAY_NAMES = new Map<string, string>([
  ["argentina", "Argentina"],
  ["australia", "Austrália"],
  ["austria", "Áustria"],
  ["belgium", "Bélgica"],
  ["bolivia", "Bolívia"],
  ["brazil", "Brasil"],
  ["chile", "Chile"],
  ["china", "China"],
  ["colombia", "Colômbia"],
  ["croatia", "Croácia"],
  ["czech republic", "República Tcheca"],
  ["denmark", "Dinamarca"],
  ["ecuador", "Equador"],
  ["england", "Inglaterra"],
  ["europe", "Europa"],
  ["france", "França"],
  ["germany", "Alemanha"],
  ["greece", "Grécia"],
  ["international", "Internacional"],
  ["italy", "Itália"],
  ["japan", "Japão"],
  ["mexico", "México"],
  ["netherlands", "Holanda"],
  ["norway", "Noruega"],
  ["paraguay", "Paraguai"],
  ["peru", "Peru"],
  ["poland", "Polônia"],
  ["portugal", "Portugal"],
  ["qatar", "Catar"],
  ["romania", "Romênia"],
  ["saudi arabia", "Arábia Saudita"],
  ["scotland", "Escócia"],
  ["serbia", "Sérvia"],
  ["south america", "América do Sul"],
  ["south korea", "Coreia do Sul"],
  ["spain", "Espanha"],
  ["sweden", "Suécia"],
  ["switzerland", "Suíça"],
  ["turkey", "Turquia"],
  ["usa", "Estados Unidos"],
  ["uruguay", "Uruguai"],
  ["venezuela", "Venezuela"],
  ["world", "Mundo"],
]);

const LEAGUE_DISPLAY_OVERRIDES_BY_ID = new Map<number, string>([
  [2, "UEFA Champions League"],
  [3, "UEFA Europa League"],
  [11, "Copa Sul-Americana"],
  [13, "Libertadores"],
  [39, "Premier League"],
  [61, "Ligue 1"],
  [71, "Brasileirão Série A"],
  [72, "Brasileirão Série B"],
  [73, "Brasileirão Série C"],
  [78, "Bundesliga"],
  [88, "Eredivisie"],
  [94, "Primeira Liga"],
  [140, "La Liga"],
  [135, "Serie A"],
  [307, "Saudi Pro League"],
]);

const LEAGUE_DISPLAY_OVERRIDES_BY_KEY = new Map<string, string>([
  ["brasil|serie a", "Brasileirão Série A"],
  ["brasil|brasileirao serie a", "Brasileirão Série A"],
  ["brasil|brazil serie a", "Brasileirão Série A"],
  ["brasil|serie b", "Brasileirão Série B"],
  ["brasil|brasileirao serie b", "Brasileirão Série B"],
  ["brasil|brazil serie b", "Brasileirão Série B"],
  ["brasil|brasiliense b", "Brasileirão Série B"],
  ["brasil|serie c", "Brasileirão Série C"],
  ["brasil|brasileirao serie c", "Brasileirão Série C"],
  ["brasil|serie d", "Brasileirão Série D"],
  ["brasil|brasileirao serie d", "Brasileirão Série D"],
  ["brasil|cup", "Copa do Brasil"],
  ["brasil|paulista a1", "Paulistão A1"],
  ["brasil|paulista a2", "Paulistão A2"],
  ["brasil|mineiro 1", "Campeonato Mineiro"],
  ["brasil|carioca 1", "Campeonato Carioca"],
  ["brasil|gaucho 1", "Campeonato Gaúcho"],
  ["argentina|liga profesional argentina", "Liga Profesional"],
  ["arabia saudita|pro league", "Saudi Pro League"],
  ["eua|major league soccer", "MLS"],
  ["estados unidos|major league soccer", "MLS"],
  ["mexico|liga mx", "Liga MX"],
]);

export function normalizeCountryDisplayName(value: string | null | undefined) {
  if (!value) {
    return "Internacional";
  }

  const normalized = normalizeLookupKey(value);
  return COUNTRY_DISPLAY_NAMES.get(normalized) ?? value;
}

export function normalizeLeagueDisplayName(
  leagueId: number,
  name: string,
  country: string | null | undefined,
) {
  const directOverride = LEAGUE_DISPLAY_OVERRIDES_BY_ID.get(leagueId);
  if (directOverride) {
    return directOverride;
  }

  const normalizedCountry = normalizeCountryDisplayName(country);
  const keyedOverride = LEAGUE_DISPLAY_OVERRIDES_BY_KEY.get(
    `${normalizeLookupKey(normalizedCountry)}|${normalizeLookupKey(name)}`,
  );

  if (keyedOverride) {
    return keyedOverride;
  }

  return name
    .replace(/\bU(\d{2})\b/g, "Sub-$1")
    .replace(/\b1st\b/gi, "1º")
    .replace(/\b2nd\b/gi, "2º")
    .replace(/\b3rd\b/gi, "3º")
    .replace(/\b4th\b/gi, "4º")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

export async function withTimeoutFallback<T>(
  task: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
