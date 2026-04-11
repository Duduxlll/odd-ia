import { env } from "@/lib/env";
import { getRegulatedBookmaker } from "@/lib/constants";
const API_FOOTBALL_REQUEST_TIMEOUT_MS = 15000;
const DIRECTORY_CACHE_TTL_MS = 1000 * 60 * 30;

let leaguesDirectoryCache:
  | {
      expiresAt: number;
      value: SupportedLeague[];
    }
  | null = null;
let bookmakersDirectoryCache:
  | {
      expiresAt: number;
      value: SupportedBookmaker[];
    }
  | null = null;
import type {
  SupportedBookmaker,
  ApiFootballFixture,
  ApiFootballFixtureStatistics,
  ApiFootballPlayer,
  ApiFootballInjury,
  ApiFootballLineup,
  ApiFootballOddsEntry,
  ApiFootballPrediction,
  ApiFootballStandingEntry,
  ApiFootballTeamStatistics,
  SupportedLeague,
} from "@/lib/types";

type ApiFootballEnvelope<T> = {
  errors?: Record<string, unknown> | unknown[];
  results?: number;
  paging?: {
    current: number;
    total: number;
  };
  response: T;
};

function formatApiFootballError(errors: ApiFootballEnvelope<unknown>["errors"]) {
  const rawMessage = Array.isArray(errors)
    ? errors.join(" | ")
    : typeof errors?.plan === "string"
      ? errors.plan
      : JSON.stringify(errors);
  const freePlanMode = env.API_FOOTBALL_FREE_PLAN_MODE;

  const pageLimitMatch = rawMessage.match(/maximum value of 3 for the Page parameter/i);
  if (pageLimitMatch) {
    return freePlanMode
      ? "No plano grátis da API-Football, a paginação máxima de odds é 3 páginas por consulta."
      : "A API-Football rejeitou uma paginação acima do permitido nessa consulta de odds.";
  }

  const rateLimitMatch = rawMessage.match(/too many requests|rate limit is (\d+) requests per minute/i);
  if (rateLimitMatch) {
    return freePlanMode
      ? "A API-Football bloqueou temporariamente por limite de requisições do plano grátis. Espere cerca de 1 minuto e rode de novo."
      : "A API-Football bloqueou temporariamente a conta por excesso de requisições. Espere cerca de 1 minuto e rode de novo.";
  }

  const dailyLimitMatch = rawMessage.match(/reached the request limit for the day/i);
  if (dailyLimitMatch) {
    return freePlanMode
      ? "A API-Football atingiu o limite diário do plano grátis. Será preciso esperar a cota renovar ou subir de plano."
      : "A API-Football atingiu o limite diário da sua conta. Será preciso esperar a cota renovar ou revisar o plano.";
  }

  const dateWindowMatch = rawMessage.match(
    /try from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i,
  );
  if (dateWindowMatch) {
    const [, fromDate, toDate] = dateWindowMatch;
    return freePlanMode
      ? `No plano grátis da API-Football, use uma data entre ${fromDate} e ${toDate}.`
      : `A API-Football liberou esta consulta somente entre ${fromDate} e ${toDate}.`;
  }

  return `API-Football retornou erro: ${rawMessage.slice(0, 220)}`;
}

function assertApiFootballConfigured() {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error("API_FOOTBALL_KEY não está configurada.");
  }
}

async function apiFootballFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  assertApiFootballConfigured();

  const url = new URL(path, env.API_FOOTBALL_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_FOOTBALL_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "x-apisports-key": env.API_FOOTBALL_KEY!,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `API-Football demorou mais de ${Math.round(API_FOOTBALL_REQUEST_TIMEOUT_MS / 1000)}s para responder.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`API-Football respondeu ${response.status} ${response.statusText}.`);
  }

  const payload = (await response.json()) as ApiFootballEnvelope<T>;
  const hasErrors = Array.isArray(payload.errors)
    ? payload.errors.length > 0
    : payload.errors && Object.keys(payload.errors).length > 0;

  if (hasErrors) {
    throw new Error(formatApiFootballError(payload.errors));
  }

  return payload;
}

async function fetchPaginated<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  pageLimit = 8,
) {
  let currentPage = 1;
  let totalPages = 1;
  const allRows: T[] = [];

  do {
    let payload: ApiFootballEnvelope<T[]>;
    try {
      payload = await apiFootballFetch<T[]>(path, {
        ...params,
        page: currentPage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFreePlanPageLimit =
        message.includes("maximum value of 3 for the Page parameter") ||
        message.includes("paginação máxima de odds é 3 páginas por consulta");

      if (isFreePlanPageLimit && allRows.length > 0) {
        break;
      }

      throw error;
    }

    allRows.push(...payload.response);
    totalPages = payload.paging?.total ?? 1;
    currentPage += 1;
  } while (currentPage <= totalPages && currentPage <= pageLimit);

  return allRows;
}

function chunkIds(ids: number[], chunkSize = 20) {
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function fetchFixturesByDate(date: string) {
  const payload = await apiFootballFetch<ApiFootballFixture[]>("/fixtures", {
    date,
    timezone: env.API_FOOTBALL_TIMEZONE,
  });

  return payload.response;
}

export async function fetchFixturesByIds(ids: number[]) {
  if (!ids.length) {
    return [] as ApiFootballFixture[];
  }

  const responses = await Promise.all(
    chunkIds(ids, 20).map(async (group) => {
      const payload = await apiFootballFetch<ApiFootballFixture[]>("/fixtures", {
        ids: group.join("-"),
        timezone: env.API_FOOTBALL_TIMEZONE,
      });

      return payload.response;
    }),
  );

  return responses.flat();
}

export async function fetchOddsByDate(date: string) {
  return fetchPaginated<ApiFootballOddsEntry>(
    "/odds",
    {
      date,
      timezone: env.API_FOOTBALL_TIMEZONE,
      bookmaker: env.API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER
        ? env.API_FOOTBALL_PRIMARY_BOOKMAKER_ID
        : undefined,
    },
    env.API_FOOTBALL_ODDS_MAX_PAGE,
  );
}

export async function fetchOddsByFixture(fixtureId: number, bookmakerId?: number) {
  const payload = await apiFootballFetch<ApiFootballOddsEntry[]>("/odds", {
    fixture: fixtureId,
    timezone: env.API_FOOTBALL_TIMEZONE,
    bookmaker: bookmakerId,
  });

  return payload.response;
}

export async function fetchPredictions(fixtureId: number) {
  const payload = await apiFootballFetch<ApiFootballPrediction[]>("/predictions", {
    fixture: fixtureId,
  });

  return payload.response[0] ?? null;
}

export async function fetchLineups(fixtureId: number) {
  const payload = await apiFootballFetch<ApiFootballLineup[]>("/fixtures/lineups", {
    fixture: fixtureId,
  });

  return payload.response;
}

export async function fetchFixtureStatistics(fixtureId: number) {
  const payload = await apiFootballFetch<ApiFootballFixtureStatistics[]>(
    "/fixtures/statistics",
    {
      fixture: fixtureId,
    },
  );

  return payload.response;
}

export async function fetchInjuries(fixtureId: number) {
  const payload = await apiFootballFetch<ApiFootballInjury[]>("/injuries", {
    fixture: fixtureId,
  });

  return payload.response;
}

export async function fetchHeadToHead(homeTeamId: number, awayTeamId: number) {
  const payload = await apiFootballFetch<ApiFootballFixture[]>("/fixtures/headtohead", {
    h2h: `${homeTeamId}-${awayTeamId}`,
    last: 5,
    timezone: env.API_FOOTBALL_TIMEZONE,
  });

  return payload.response;
}

export async function fetchRecentFixtures(teamId: number, last = 5) {
  const payload = await apiFootballFetch<ApiFootballFixture[]>("/fixtures", {
    team: teamId,
    last,
    timezone: env.API_FOOTBALL_TIMEZONE,
  });

  return payload.response;
}

export async function fetchNextFixtures(teamId: number, next = 2) {
  const payload = await apiFootballFetch<ApiFootballFixture[]>("/fixtures", {
    team: teamId,
    next,
    timezone: env.API_FOOTBALL_TIMEZONE,
  });

  return payload.response;
}

export async function fetchStandings(leagueId: number, season: number) {
  const payload = await apiFootballFetch<
    Array<{
      league?: {
        standings?: ApiFootballStandingEntry[][];
      };
    }>
  >("/standings", {
    league: leagueId,
    season,
  });

  const standings = payload.response[0]?.league?.standings ?? [];
  return standings.flat();
}

export async function fetchTeamStatistics(
  leagueId: number,
  season: number,
  teamId: number,
  date?: string,
) {
  const payload = await apiFootballFetch<ApiFootballTeamStatistics>("/teams/statistics", {
    league: leagueId,
    season,
    team: teamId,
    date,
  });

  return payload.response ?? null;
}

export async function fetchTeamPlayers(
  teamId: number,
  season: number,
  leagueId?: number,
  pageLimit = 3,
) {
  return fetchPaginated<ApiFootballPlayer>(
    "/players",
    {
      team: teamId,
      season,
      league: leagueId,
    },
    pageLimit,
  );
}

export async function fetchFixturesByVenue(venueId: number, last = 5) {
  const payload = await apiFootballFetch<ApiFootballFixture[]>("/fixtures", {
    venue: venueId,
    last,
    timezone: env.API_FOOTBALL_TIMEZONE,
  });

  return payload.response;
}

export async function fetchLeagueRecentFixtures(
  leagueId: number,
  season: number,
  last = 20,
  status = "FT",
) {
  const payload = await apiFootballFetch<ApiFootballFixture[]>("/fixtures", {
    league: leagueId,
    season,
    last,
    status,
    timezone: env.API_FOOTBALL_TIMEZONE,
  });

  return payload.response;
}

export async function fetchAvailableLeagues() {
  if (leaguesDirectoryCache && leaguesDirectoryCache.expiresAt > Date.now()) {
    return leaguesDirectoryCache.value;
  }

  const payload = await apiFootballFetch<
    Array<{
      league?: {
        id?: number;
        name?: string;
        type?: string;
      };
      country?: {
        name?: string;
      };
      seasons?: Array<{
        current?: boolean;
        year?: number;
      }>;
    }>
  >("/leagues", {
    current: "true",
    season: env.DEFAULT_SEASON,
  });

  const mappedLeagues = payload.response
    .map((entry) => {
      const id = entry.league?.id;
      const name = entry.league?.name;
      if (!id || !name) {
        return null;
      }

      const type = entry.league?.type?.toLowerCase() ?? "";
      return {
        id,
        name,
        country: entry.country?.name ?? "Internacional",
        emphasis: type === "cup" ? "copa ativa" : "liga ativa",
      } satisfies SupportedLeague;
    })
    .filter((league): league is SupportedLeague => Boolean(league));

  const deduped = new Map<number, SupportedLeague>();
  for (const league of mappedLeagues) {
    deduped.set(league.id, league);
  }

  const leagues = Array.from(deduped.values()).sort(
    (left, right) =>
      left.country.localeCompare(right.country, "pt-BR") ||
      left.name.localeCompare(right.name, "pt-BR"),
  );

  leaguesDirectoryCache = {
    value: leagues,
    expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS,
  };

  return leagues;
}

export async function fetchAvailableBookmakers() {
  if (bookmakersDirectoryCache && bookmakersDirectoryCache.expiresAt > Date.now()) {
    return bookmakersDirectoryCache.value;
  }

  const payload = await apiFootballFetch<Array<{ id?: number; name?: string }>>(
    "/odds/bookmakers",
    {},
  );

  const bookmakers = payload.response
    .flatMap((entry) => {
      if (!entry.id || !entry.name) {
        return [];
      }

      const regulatedBookmaker = getRegulatedBookmaker(entry.name);
      if (!regulatedBookmaker) {
        return [];
      }

      return [{
        id: entry.id,
        name: entry.name,
        emphasis: regulatedBookmaker.domain,
      } satisfies SupportedBookmaker];
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  bookmakersDirectoryCache = {
    value: bookmakers,
    expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS,
  };

  return bookmakers;
}
