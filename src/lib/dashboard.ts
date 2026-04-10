import { DEFAULT_FILTERS, SUPPORTED_MARKETS, TOP_FOOTBALL_LEAGUES } from "@/lib/constants";
import {
  ensureSchema,
  getDashboardState,
  getLatestAnalysisRun,
  getOperationsStatus,
  getPerformanceSummary,
} from "@/lib/db";
import { getConfigStatus } from "@/lib/env";
import {
  fetchAvailableBookmakers,
  fetchAvailableLeagues,
} from "@/lib/providers/api-football";

export async function getDashboardSnapshot(username: string) {
  await ensureSchema();
  const [latestRun, performance, dashboardState, operations, allLeagues, allBookmakers] =
    await Promise.all([
    getLatestAnalysisRun(username),
    getPerformanceSummary(username),
    getDashboardState(username),
    getOperationsStatus(username),
    fetchAvailableLeagues().catch(() => TOP_FOOTBALL_LEAGUES),
    fetchAvailableBookmakers().catch(() => []),
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
    draftFilters: dashboardState.draftFilters ?? latestRun?.filters ?? DEFAULT_FILTERS,
    defaultFilters: DEFAULT_FILTERS,
    supportedLeagues: mergedLeagues,
    supportedBookmakers: allBookmakers,
    supportedMarkets: SUPPORTED_MARKETS,
  };
}
