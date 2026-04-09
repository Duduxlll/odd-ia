import { DEFAULT_FILTERS, SUPPORTED_MARKETS, TOP_FOOTBALL_LEAGUES } from "@/lib/constants";
import { ensureSchema, getLatestAnalysisRun, getPerformanceSummary } from "@/lib/db";
import { getConfigStatus } from "@/lib/env";

export async function getDashboardSnapshot() {
  await ensureSchema();
  const [latestRun, performance] = await Promise.all([
    getLatestAnalysisRun(),
    getPerformanceSummary(),
  ]);

  return {
    config: getConfigStatus(),
    latestRun,
    performance,
    defaultFilters: DEFAULT_FILTERS,
    supportedLeagues: TOP_FOOTBALL_LEAGUES,
    supportedMarkets: SUPPORTED_MARKETS,
  };
}
