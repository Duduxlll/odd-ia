import { addHours, eachDayOfInterval, format, startOfDay } from "date-fns";

import { DEFAULT_FILTERS } from "@/lib/constants";
import {
  getPrefetchCache,
  purgeExpiredPrefetchCache,
  setPrefetchCache,
} from "@/lib/db";
import type {
  AnalysisFilters,
  ApiFootballFixture,
  ApiFootballOddsEntry,
} from "@/lib/types";
import { fetchFixturesByDate, fetchOddsByFixture } from "@/lib/providers/api-football";
import { mapLimit } from "@/lib/utils";
import { env } from "@/lib/env";

const FIXTURE_CACHE_TTL_MINUTES = 45;
const ODDS_CACHE_TTL_MINUTES = 20;

function buildFixtureCacheKey(date: string) {
  return date;
}

function buildOddsCacheKey(fixtureId: number, bookmakerId?: number) {
  return bookmakerId ? `${fixtureId}:${bookmakerId}` : String(fixtureId);
}

function getPrefetchDates(baseDate: string, horizonHours: number) {
  const start = startOfDay(new Date(`${baseDate}T00:00:00`));
  const end = addHours(start, horizonHours);

  return eachDayOfInterval({ start, end }).map((date) => format(date, "yyyy-MM-dd"));
}

function selectPrefetchFixtures(fixtures: ApiFootballFixture[], filters: AnalysisFilters, limit: number) {
  return fixtures
    .filter((fixture) =>
      filters.leagueIds.length ? filters.leagueIds.includes(fixture.league.id) : true,
    )
    .sort(
      (left, right) =>
        new Date(left.fixture.date).getTime() - new Date(right.fixture.date).getTime(),
    )
    .slice(0, limit);
}

export async function getCachedFixturesByDate(date: string) {
  const cacheKey = buildFixtureCacheKey(date);
  const cached = await getPrefetchCache<ApiFootballFixture[]>("fixtures", cacheKey, FIXTURE_CACHE_TTL_MINUTES);
  if (cached?.length) {
    return cached;
  }

  const live = await fetchFixturesByDate(date);
  await setPrefetchCache("fixtures", cacheKey, live, FIXTURE_CACHE_TTL_MINUTES);
  return live;
}

export async function getCachedOddsByFixture(fixtureId: number, bookmakerId?: number) {
  const cacheKey = buildOddsCacheKey(fixtureId, bookmakerId);
  const cached = await getPrefetchCache<ApiFootballOddsEntry[]>("odds", cacheKey, ODDS_CACHE_TTL_MINUTES);
  if (cached?.length) {
    return cached;
  }

  const live = await fetchOddsByFixture(fixtureId, bookmakerId);
  await setPrefetchCache("odds", cacheKey, live, ODDS_CACHE_TTL_MINUTES);
  return live;
}

export async function prefetchRadarData(filters: AnalysisFilters = DEFAULT_FILTERS) {
  await purgeExpiredPrefetchCache();

  const dates = getPrefetchDates(filters.scanDate, Math.max(filters.horizonHours, 36));
  const fixturesByDate = await Promise.all(
    dates.map(async (date) => {
      const fixtures = await fetchFixturesByDate(date).catch(() => [] as ApiFootballFixture[]);
      await setPrefetchCache("fixtures", buildFixtureCacheKey(date), fixtures, FIXTURE_CACHE_TTL_MINUTES);
      return fixtures;
    }),
  );

  const flattened = fixturesByDate.flat();
  const fixtureBudget = env.API_FOOTBALL_FREE_PLAN_MODE
    ? Math.min(8, flattened.length)
    : Math.min(Math.max(filters.pickCount * 3, 18), flattened.length);
  const fixtureTargets = selectPrefetchFixtures(flattened, filters, fixtureBudget);

  await mapLimit(
    fixtureTargets,
    env.API_FOOTBALL_FREE_PLAN_MODE ? 1 : Math.min(6, env.API_FOOTBALL_ODDS_CONCURRENCY),
    async (fixture) => {
      const odds = await fetchOddsByFixture(
        fixture.fixture.id,
        env.API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER
          ? env.API_FOOTBALL_PRIMARY_BOOKMAKER_ID
          : undefined,
      ).catch(() => [] as ApiFootballOddsEntry[]);

      await setPrefetchCache(
        "odds",
        buildOddsCacheKey(
          fixture.fixture.id,
          env.API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER
            ? env.API_FOOTBALL_PRIMARY_BOOKMAKER_ID
            : undefined,
        ),
        odds,
        ODDS_CACHE_TTL_MINUTES,
      );
    },
  );

  return {
    datesPrefetched: dates.length,
    fixturesPrefetched: flattened.length,
    oddsPrefetched: fixtureTargets.length,
  };
}
