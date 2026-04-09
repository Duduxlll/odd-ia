import { z } from "zod";

const currentYear = new Date().getFullYear();
const inferredSeason = new Date().getMonth() >= 6 ? currentYear : currentYear - 1;

const schema = z.object({
  AUTH_USERNAME: z.string().optional(),
  AUTH_PASSWORD: z.string().optional(),
  AUTH_USERS_JSON: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.4"),
  OPENAI_ENABLE_WEB_SEARCH: z
    .string()
    .default("true")
    .transform((value) => value !== "false"),
  API_FOOTBALL_KEY: z.string().optional(),
  API_FOOTBALL_BASE_URL: z.string().default("https://v3.football.api-sports.io"),
  API_FOOTBALL_TIMEZONE: z.string().default("America/Sao_Paulo"),
  API_FOOTBALL_ODDS_MAX_PAGE: z.coerce.number().default(12),
  API_FOOTBALL_FREE_PLAN_MODE: z
    .string()
    .default("false")
    .transform((value) => value !== "false"),
  API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER: z
    .string()
    .default("false")
    .transform((value) => value !== "false"),
  API_FOOTBALL_PRIMARY_BOOKMAKER_ID: z.coerce.number().default(34),
  API_FOOTBALL_PRIMARY_BOOKMAKER_NAME: z.string().default("Superbet"),
  API_FOOTBALL_PRIMARY_BOOKMAKER_URL: z.string().default("https://superbet.bet.br/"),
  API_FOOTBALL_MAX_FIXTURES_PER_SCAN: z.coerce.number().default(24),
  API_FOOTBALL_ODDS_CONCURRENCY: z.coerce.number().default(6),
  API_FOOTBALL_CONTEXT_CONCURRENCY: z.coerce.number().default(4),
  API_FOOTBALL_MAX_SEED_CANDIDATES: z.coerce.number().default(72),
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  DEFAULT_SEASON: z.coerce.number().default(inferredSeason),
});

const parsed = schema.parse({
  AUTH_USERNAME: process.env.AUTH_USERNAME,
  AUTH_PASSWORD: process.env.AUTH_PASSWORD,
  AUTH_USERS_JSON: process.env.AUTH_USERS_JSON,
  AUTH_SECRET: process.env.AUTH_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_ENABLE_WEB_SEARCH: process.env.OPENAI_ENABLE_WEB_SEARCH,
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL,
  API_FOOTBALL_TIMEZONE: process.env.API_FOOTBALL_TIMEZONE,
  API_FOOTBALL_ODDS_MAX_PAGE: process.env.API_FOOTBALL_ODDS_MAX_PAGE,
  API_FOOTBALL_FREE_PLAN_MODE: process.env.API_FOOTBALL_FREE_PLAN_MODE,
  API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER: process.env.API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER,
  API_FOOTBALL_PRIMARY_BOOKMAKER_ID: process.env.API_FOOTBALL_PRIMARY_BOOKMAKER_ID,
  API_FOOTBALL_PRIMARY_BOOKMAKER_NAME: process.env.API_FOOTBALL_PRIMARY_BOOKMAKER_NAME,
  API_FOOTBALL_PRIMARY_BOOKMAKER_URL: process.env.API_FOOTBALL_PRIMARY_BOOKMAKER_URL,
  API_FOOTBALL_MAX_FIXTURES_PER_SCAN: process.env.API_FOOTBALL_MAX_FIXTURES_PER_SCAN,
  API_FOOTBALL_ODDS_CONCURRENCY: process.env.API_FOOTBALL_ODDS_CONCURRENCY,
  API_FOOTBALL_CONTEXT_CONCURRENCY: process.env.API_FOOTBALL_CONTEXT_CONCURRENCY,
  API_FOOTBALL_MAX_SEED_CANDIDATES: process.env.API_FOOTBALL_MAX_SEED_CANDIDATES,
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  DEFAULT_SEASON: process.env.DEFAULT_SEASON,
});

export const env = {
  ...parsed,
  OPENAI_ENABLE_WEB_SEARCH: parsed.OPENAI_ENABLE_WEB_SEARCH,
  storageMode: parsed.TURSO_DATABASE_URL ? ("turso" as const) : ("local" as const),
};

export function getConfigStatus() {
  const hasLegacyUser = Boolean(env.AUTH_USERNAME && env.AUTH_PASSWORD);
  const hasMultiUser = Boolean(env.AUTH_USERS_JSON?.trim());

  return {
    authEnabled: Boolean(env.AUTH_SECRET && (hasLegacyUser || hasMultiUser)),
    openai: Boolean(env.OPENAI_API_KEY),
    apiFootball: Boolean(env.API_FOOTBALL_KEY),
    apiFootballPlanMode: env.API_FOOTBALL_FREE_PLAN_MODE ? ("free" as const) : ("pro" as const),
    primaryBookmakerName: env.API_FOOTBALL_PRIMARY_BOOKMAKER_NAME,
    primaryBookmakerUrl: env.API_FOOTBALL_PRIMARY_BOOKMAKER_URL,
    singleBookmakerMode: env.API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER,
    tursoRemote: Boolean(env.TURSO_DATABASE_URL),
    storageMode: env.storageMode,
    webSearchEnabled: Boolean(env.OPENAI_API_KEY) && env.OPENAI_ENABLE_WEB_SEARCH,
    openAiModel: env.OPENAI_MODEL,
  };
}
