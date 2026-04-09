import { DEFAULT_FILTERS, SUPPORTED_MARKETS, TOP_FOOTBALL_LEAGUES } from "@/lib/constants";
import {
  ensureSchema,
  getDashboardState,
  getLatestAnalysisRun,
  getPerformanceSummary,
} from "@/lib/db";
import { getConfigStatus } from "@/lib/env";

export async function getDashboardSnapshot(username: string) {
  await ensureSchema();
  const [latestRun, performance, dashboardState] = await Promise.all([
    getLatestAnalysisRun(username),
    getPerformanceSummary(username),
    getDashboardState(username),
  ]);

  return {
    config: getConfigStatus(),
    latestRun,
    activeJob: dashboardState.activeJob,
    performance,
    draftFilters: dashboardState.draftFilters ?? latestRun?.filters ?? DEFAULT_FILTERS,
    defaultFilters: DEFAULT_FILTERS,
    supportedLeagues: TOP_FOOTBALL_LEAGUES,
    supportedMarkets: SUPPORTED_MARKETS,
  };
}
