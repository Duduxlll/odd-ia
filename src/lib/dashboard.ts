import {
  DEFAULT_FILTERS,
  SUPPORTED_MARKETS,
  TOP_FOOTBALL_LEAGUES,
  normalizeAnalysisFilters,
} from "@/lib/constants";
import {
  ensureSchema,
  getDashboardState,
  getLatestAnalysisRun,
  getOperationsStatus,
  getPerformanceSummary,
} from "@/lib/db";
import { getConfigStatus } from "@/lib/env";
import { getCachedFixturesByDate } from "@/lib/prefetch";
import {
  fetchAvailableBookmakers,
  fetchAvailableLeagues,
} from "@/lib/providers/api-football";
import type { OperationsStatus, PerformanceSummary } from "@/lib/types";
import {
  getDateKeyFromIsoInSaoPaulo,
  getTodayDateInSaoPaulo,
  getTomorrowDateInSaoPaulo,
  withTimeoutFallback,
} from "@/lib/utils";

const EMPTY_PERFORMANCE: PerformanceSummary = {
  totalTracked: 0,
  settledCount: 0,
  wins: 0,
  losses: 0,
  voids: 0,
  ungraded: 0,
  openCount: 0,
  roiUnits: 0,
  roiPct: null,
  hitRate: null,
  averageClv: null,
  positiveClvRate: null,
  byMarket: [],
  byLeague: [],
  byConfidence: [],
};

const EMPTY_OPERATIONS: OperationsStatus = {
  calibration: {
    updatedAt: null,
    sampleSize: 0,
    overall: null,
    byMarket: {},
    byLeague: {},
  },
  prefetch: {
    fixtureEntries: 0,
    oddsEntries: 0,
    lastFixturesAt: null,
    lastOddsAt: null,
  },
  worker: {
    queuedJobs: 0,
    runningJobs: 0,
    failedLast24h: 0,
    completedLast24h: 0,
    lastCompletedAt: null,
  },
};

export async function getDashboardSnapshot(username: string) {
  await ensureSchema();
  const today = getTodayDateInSaoPaulo();
  const tomorrow = getTomorrowDateInSaoPaulo();
  const [latestRun, performance, dashboardState, operations, allLeagues, allBookmakers, fixturesToday, fixturesTomorrow] =
    await Promise.all([
      withTimeoutFallback(getLatestAnalysisRun(username), 8000, null),
      withTimeoutFallback(getPerformanceSummary(username), 6000, EMPTY_PERFORMANCE),
      withTimeoutFallback(
        getDashboardState(username),
        8000,
        { activeJob: null, draftFilters: DEFAULT_FILTERS },
      ),
      withTimeoutFallback(getOperationsStatus(username), 6000, EMPTY_OPERATIONS),
      withTimeoutFallback(
        fetchAvailableLeagues().catch(() => TOP_FOOTBALL_LEAGUES),
        4000,
        TOP_FOOTBALL_LEAGUES,
      ),
      withTimeoutFallback(
        fetchAvailableBookmakers().catch(() => []),
        4000,
        [],
      ),
      withTimeoutFallback(
        getCachedFixturesByDate(today).catch(() => []),
        4000,
        [],
      ),
      withTimeoutFallback(
        getCachedFixturesByDate(tomorrow).catch(() => []),
        4000,
        [],
      ),
    ]);

  const priorityOrder = new Map(TOP_FOOTBALL_LEAGUES.map((league, index) => [league.id, index]));
  const mergedLeagues = [
    ...TOP_FOOTBALL_LEAGUES,
    ...allLeagues.filter((league) => !priorityOrder.has(league.id)),
  ].map((league) => {
    const priority = TOP_FOOTBALL_LEAGUES.find((item) => item.id === league.id);
    return priority ?? league;
  });

  return {
    config: getConfigStatus(),
    latestRun,
    activeJob: dashboardState.activeJob,
    performance,
    operations,
    draftFilters: normalizeAnalysisFilters(
      dashboardState.draftFilters ?? latestRun?.filters ?? DEFAULT_FILTERS,
    ),
    defaultFilters: DEFAULT_FILTERS,
    supportedLeagues: mergedLeagues,
    supportedBookmakers: allBookmakers,
    supportedMarkets: SUPPORTED_MARKETS,
    scanFixtures: [...fixturesToday, ...fixturesTomorrow]
      .filter((fixture) => {
        const kickoffAt = new Date(fixture.fixture.date).getTime();
        return Number.isFinite(kickoffAt) && kickoffAt > Date.now();
      })
      .map((fixture) => ({
        fixtureId: fixture.fixture.id,
        leagueId: fixture.league.id,
        leagueName: fixture.league.name,
        leagueCountry: fixture.league.country,
        kickoffAt: fixture.fixture.date,
        scanDate: getDateKeyFromIsoInSaoPaulo(fixture.fixture.date),
        statusShort: fixture.fixture.status?.short ?? null,
      })),
  };
}
