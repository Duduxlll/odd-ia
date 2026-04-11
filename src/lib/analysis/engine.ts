import { eachDayOfInterval, format } from "date-fns";

import {
  DEFAULT_FILTERS,
  getMarketStabilityBias,
  isRegulatedBookmakerName,
  resolveMarketCategory,
} from "@/lib/constants";
import { reviewPicksWithOpenAI } from "@/lib/analysis/openai";
import {
  getLatestClosingOdd,
  getCalibrationProfile,
  getLineHistoryByCandidateIds,
  rebuildCalibrationProfile,
  getTrackedPicksForRefresh,
  saveAnalysisRun,
  updatePickLifecycle,
} from "@/lib/db";
import { env } from "@/lib/env";
import {
  fetchFixtureStatistics,
  fetchFixturesByIds,
  fetchFixturesByVenue,
  fetchHeadToHead,
  fetchInjuries,
  fetchLeagueRecentFixtures,
  fetchLineups,
  fetchNextFixtures,
  fetchPredictions,
  fetchRecentFixtures,
  fetchStandings,
  fetchTeamPlayers,
  fetchTeamStatistics,
} from "@/lib/providers/api-football";
import { getCachedFixturesByDate, getCachedOddsByFixture } from "@/lib/prefetch";
import { fetchWeatherSnapshot } from "@/lib/providers/weather";
import type {
  AnalysisSection,
  AnalysisFilters,
  AnalysisPick,
  AnalysisRun,
  ApiFootballFixture,
  ApiFootballPlayer,
  ApiFootballFixtureStatistics,
  ApiFootballInjury,
  ApiFootballLineup,
  ApiFootballOddsEntry,
  ApiFootballPrediction,
  ApiFootballStandingEntry,
  ApiFootballTeamStatistics,
  CalibrationBucket,
  CalibrationProfile,
  ClvSnapshot,
  LineMovementSnapshot,
  MarketCategoryId,
  PickTrackingSnapshot,
  RefereeStatsSnapshot,
  WeatherSnapshot,
  XgContextSnapshot,
} from "@/lib/types";
import {
  clamp,
  formatOdd,
  getScanDateLabel,
  getTodayDateInSaoPaulo,
  mapLimit,
  mean,
  parseDecimal,
  parsePercentString,
  resolveAllowedScanDate,
  slugify,
} from "@/lib/utils";

type RawCandidate = {
  candidateId: string;
  fixtureId: number;
  fixtureDate: string;
  leagueId: number;
  leagueName: string;
  leagueCountry: string;
  season: number;
  round: string;
  referee: string | null;
  venueId: number | null;
  venueName: string | null;
  venueCity: string | null;
  marketId: number;
  marketName: string;
  marketCategory: MarketCategoryId;
  selection: string;
  selectionKey: string;
  rawMarketName: string;
  rawSelectionValue: string;
  rawHandicap: string | null;
  bestOdd: number;
  consensusOdd: number;
  bookmaker: string;
  bookmakerPool: string[];
  sportsbookCount: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  lineValue: number | null;
  seedScore: number;
  lineHistory: {
    openingOdd: number | null;
    previousOdd: number | null;
    sampleCount: number;
  } | null;
};

type TeamSnapshot = {
  matches: number;
  pointsPerMatch: number;
  goalsForAvg: number;
  goalsAgainstAvg: number;
  scoringRate: number;
  concedingRate: number;
  over25Rate: number;
  cleanSheetRate: number;
  shotsAvg: number;
  shotsOnTargetAvg: number;
  shotsFacedAvg: number;
  shotsOnTargetFacedAvg: number;
  shotsInsideBoxAvg: number;
  shotsInsideBoxFacedAvg: number;
  cornersForAvg: number;
  cornersAgainstAvg: number;
  foulsAvg: number;
  cardsAvg: number;
  possessionAvg: number | null;
  passAccuracyAvg: number | null;
  xgAvg: number | null;
  xgaAvg: number | null;
  xgDirectCoverage: number;
  advancedStatsCoverage: number;
};

type SimplifiedPlayer = {
  id: number;
  name: string;
  position: string | null;
  minutes: number;
  appearances: number;
  lineups: number;
  rating: number | null;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  keyPasses: number;
  passes: number;
  passAccuracy: number | null;
  tackles: number;
  interceptions: number;
  duelsWon: number;
  dribblesSuccess: number;
  yellow: number;
  red: number;
  injured: boolean;
};

type TeamProfile = {
  teamId: number;
  teamName: string;
  standing: ApiFootballStandingEntry | null;
  seasonStats: ApiFootballTeamStatistics | null;
  recent5: TeamSnapshot;
  recent10: TeamSnapshot;
  sidePointsPerMatch: number;
  overallPointsPerMatch: number;
  sideGoalsForAvg: number;
  sideGoalsAgainstAvg: number;
  overallGoalsForAvg: number;
  overallGoalsAgainstAvg: number;
  cleanSheetRate: number;
  failedToScoreRate: number;
  penaltiesScored: number;
  yellowCardsTotal: number;
  redCardsTotal: number;
  formString: string | null;
  styleTags: string[];
  dominantFormations: string[];
  structuralAbsences: string[];
  likelySuspensions: string[];
  benchNote: string | null;
  dependencyNotes: string[];
  players: SimplifiedPlayer[];
  topFinisher: SimplifiedPlayer | null;
  topCreator: SimplifiedPlayer | null;
  topShield: SimplifiedPlayer | null;
  topConductor: SimplifiedPlayer | null;
  topSetPiece: SimplifiedPlayer | null;
  restDays: number | null;
  gamesLast14: number;
  nextGameGapDays: number | null;
  nextGameLabel: string | null;
  travelNote: string | null;
  earlyScoringShare: number | null;
  lateScoringShare: number | null;
  earlyConcedingShare: number | null;
  lateConcedingShare: number | null;
  lineupStatus: "confirmed" | "projected" | "unknown";
};

type TeamContext = {
  recentFixtures: ApiFootballFixture[];
  recentDetailedFixtures: ApiFootballFixture[];
  seasonStats: ApiFootballTeamStatistics | null;
  standing: ApiFootballStandingEntry | null;
  players: ApiFootballPlayer[];
  nextFixtures: ApiFootballFixture[];
};

type RefereeProfile = {
  refereeName: string;
  samples: number;
  yellowAvg: number | null;
  redAvg: number | null;
  foulsAvg: number | null;
  homeBias: number | null;
  over45CardsRate: number | null;
};

type VenueProfile = {
  venueId: number | null;
  samples: number;
  goalsAvg: number | null;
  cornersAvg: number | null;
  cardsAvg: number | null;
  homeWinRate: number | null;
};

type CompetitiveContext = {
  competitionType: "mata-mata" | "pontos-corridos" | "fase-de-grupos" | "amistoso" | "copa";
  tieStage: "ida" | "volta" | "jogo-unico" | "nao-aplicavel";
  aggregateNote: string | null;
  importanceNote: string | null;
  nextGameRiskNote: string | null;
  derbyNote: string | null;
};

type FixtureContext = {
  prediction: ApiFootballPrediction | null;
  lineups: ApiFootballLineup[];
  injuries: ApiFootballInjury[];
  h2h: ApiFootballFixture[];
  standings: ApiFootballStandingEntry[];
  home: TeamContext;
  away: TeamContext;
  venueProfile: VenueProfile | null;
  refereeProfile: RefereeProfile | null;
  competitiveContext: CompetitiveContext;
  weather: WeatherSnapshot | null;
};

type EnrichedCandidate = RawCandidate & {
  context: FixtureContext;
};

function normalizeFilters(filters: Partial<AnalysisFilters> | undefined): AnalysisFilters {
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    scanDate: resolveAllowedScanDate(filters?.scanDate),
    horizonHours: 24,
    leagueIds: Array.isArray(filters?.leagueIds) ? filters.leagueIds : DEFAULT_FILTERS.leagueIds,
    bookmakerIds: [],
    marketCategories: filters?.marketCategories?.length
      ? filters.marketCategories
      : DEFAULT_FILTERS.marketCategories,
  };
}

function getScanDayStart(scanDate: string) {
  return new Date(`${scanDate}T00:00:00-03:00`);
}

function getScanDayEnd(scanDate: string) {
  return new Date(`${scanDate}T23:59:59.999-03:00`);
}

function getScanWindow(scanDate: string, horizonHours: number) {
  const todayInScanTimezone = getTodayDateInSaoPaulo();
  const dayStart = getScanDayStart(scanDate);
  const dayEnd = getScanDayEnd(scanDate);

  if (horizonHours === 24) {
    return {
      start: scanDate === todayInScanTimezone ? new Date() : dayStart,
      end: dayEnd,
    };
  }

  return {
    start: dayStart,
    end: dayEnd,
  };
}

function getScanDates(scanDate: string, horizonHours: number) {
  const { start, end } = getScanWindow(scanDate, horizonHours);

  return eachDayOfInterval({ start, end }).map((date) => format(date, "yyyy-MM-dd"));
}

function filterEligibleFixtures(
  fixtures: ApiFootballFixture[],
  filters: AnalysisFilters,
) {
  return fixtures
    .filter((fixture) => isFixtureInsideWindow(fixture.fixture.date, filters.scanDate, filters.horizonHours))
    .filter((fixture) =>
      filters.leagueIds.length ? filters.leagueIds.includes(fixture.league.id) : true,
    )
    .sort(
      (left, right) =>
        new Date(left.fixture.date).getTime() - new Date(right.fixture.date).getTime(),
    );
}

function getRemainingFixturesToday(
  fixtures: ApiFootballFixture[],
  scanDate: string,
  horizonHours: number,
) {
  return fixtures.filter((fixture) =>
    isFixtureInsideWindow(fixture.fixture.date, scanDate, horizonHours),
  );
}

function selectFixturesForOdds(
  fixtures: ApiFootballFixture[],
  filters: AnalysisFilters,
  maxFixtures: number,
) {
  const byLeague = new Map<number, ApiFootballFixture[]>();

  for (const fixture of fixtures) {
    const bucket = byLeague.get(fixture.league.id) ?? [];
    bucket.push(fixture);
    byLeague.set(fixture.league.id, bucket);
  }

  const leagueOrder = filters.leagueIds.length
    ? filters.leagueIds
    : Array.from(byLeague.keys());
  const selected: ApiFootballFixture[] = [];
  let added = true;

  while (selected.length < maxFixtures && added) {
    added = false;

    for (const leagueId of leagueOrder) {
      const queue = byLeague.get(leagueId);
      if (!queue?.length) {
        continue;
      }

      selected.push(queue.shift()!);
      added = true;

      if (selected.length >= maxFixtures) {
        break;
      }
    }
  }

  return selected;
}

function balanceItemsByCategory<T extends { marketCategory: MarketCategoryId }>(
  items: T[],
  categories: MarketCategoryId[],
  limit: number,
  getKey: (item: T) => string,
) {
  if (limit <= 0 || items.length <= limit || categories.length <= 1) {
    return items.slice(0, limit);
  }

  const activeCategories = Array.from(new Set(categories)).filter((category) =>
    items.some((item) => item.marketCategory === category),
  );

  if (activeCategories.length <= 1) {
    return items.slice(0, limit);
  }

  const queueByCategory = new Map(
    activeCategories.map((category) => [
      category,
      items.filter((item) => item.marketCategory === category),
    ]),
  );
  const selected: T[] = [];
  const usedKeys = new Set<string>();
  let added = true;

  while (selected.length < limit && added) {
    added = false;

    for (const category of activeCategories) {
      const queue = queueByCategory.get(category);
      if (!queue?.length) {
        continue;
      }

      const next = queue.shift()!;
      const key = getKey(next);
      if (usedKeys.has(key)) {
        continue;
      }

      usedKeys.add(key);
      selected.push(next);
      added = true;

      if (selected.length >= limit) {
        break;
      }
    }
  }

  if (selected.length < limit) {
    for (const item of items) {
      const key = getKey(item);
      if (usedKeys.has(key)) {
        continue;
      }

      usedKeys.add(key);
      selected.push(item);

      if (selected.length >= limit) {
        break;
      }
    }
  }

  return selected;
}

function isFixtureInsideWindow(
  fixtureDate: string,
  scanDate: string,
  horizonHours: number,
) {
  const kickoff = new Date(fixtureDate);
  const { start: windowStart, end: windowEnd } = getScanWindow(scanDate, horizonHours);

  return kickoff >= windowStart && kickoff <= windowEnd;
}

function displaySelection(rawSelection: unknown, homeTeam: string, awayTeam: string) {
  const normalizedSelection = String(rawSelection).trim();
  const lower = normalizedSelection.toLowerCase();

  if (lower === "home") return homeTeam;
  if (lower === "away") return awayTeam;
  if (lower === "1") return homeTeam;
  if (lower === "2") return awayTeam;
  if (lower === "x" || lower === "draw") return "Empate";
  if (lower === "home/draw" || lower === "1x") return `${homeTeam} ou empate`;
  if (lower === "away/draw" || lower === "x2") return `${awayTeam} ou empate`;
  if (lower === "home/away" || lower === "12") return `${homeTeam} ou ${awayTeam}`;

  return normalizedSelection
    .replace(/^home\b/i, homeTeam)
    .replace(/^away\b/i, awayTeam)
    .replace(/^draw\b/i, "Empate");
}

function formatLineValue(line: number | null) {
  if (line === null) {
    return null;
  }

  const rounded = Number.isInteger(line) ? line.toFixed(0) : line.toFixed(2);
  return rounded.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatSignedLineValue(line: number | null) {
  const formatted = formatLineValue(line);
  if (formatted === null) {
    return null;
  }

  return line !== null && line > 0 ? `+${formatted}` : formatted;
}

function selectionDirection(selection: string) {
  const normalized = selection.toLowerCase();
  if (normalized.startsWith("over")) return "over";
  if (normalized.startsWith("under")) return "under";
  if (normalized === "yes" || normalized.includes("sim")) return "yes";
  if (normalized === "no" || normalized.includes("nao")) return "no";
  return null;
}

function isOverUnderDirection(
  direction: ReturnType<typeof selectionDirection>,
): direction is "over" | "under" {
  return direction === "over" || direction === "under";
}

function buildThresholdLabel(
  direction: "over" | "under",
  lineText: string | null,
  scope: string,
  unit: string,
  lineValue: number | null = null,
) {
  const prefix = direction === "over" ? "mais de" : "menos de";
  const pluralUnit = resolveBetUnitLabel(unit, lineValue);
  const label = `${prefix} ${lineText ?? ""} ${pluralUnit} ${scope}`.replace(/\s+/g, " ").trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function resolveBetUnitLabel(unit: string, lineValue: number | null) {
  const normalized = unit.toLowerCase();
  const singular =
    lineValue === null ||
    Math.abs(lineValue) <= 1;

  if (normalized === "gol") return singular ? "gol" : "gols";
  if (normalized === "escanteio") return singular ? "escanteio" : "escanteios";
  if (normalized === "cartao") return singular ? "cartão" : "cartões";
  if (normalized === "chute") return singular ? "chute" : "chutes";
  if (normalized === "chute no alvo") return singular ? "chute no alvo" : "chutes no alvo";
  if (normalized === "impedimento") return singular ? "impedimento" : "impedimentos";
  if (normalized === "passe") return singular ? "passe" : "passes";
  if (normalized === "desarme") return singular ? "desarme" : "desarmes";
  if (normalized === "interceptação") return singular ? "interceptação" : "interceptações";
  if (normalized === "falta") return singular ? "falta" : "faltas";
  if (normalized === "lateral") return singular ? "lateral" : "laterais";
  if (normalized === "tiro de meta") return singular ? "tiro de meta" : "tiros de meta";
  if (normalized === "defesa") return singular ? "defesa" : "defesas";
  if (normalized === "assistência") return singular ? "assistência" : "assistências";
  if (normalized === "corte") return singular ? "corte" : "cortes";
  if (normalized === "bloqueio") return singular ? "bloqueio" : "bloqueios";
  return unit;
}

function resolvePeriodSuffix(marketName: string) {
  if (marketName.includes("second half") || marketName.includes("2nd half")) {
    return "no 2º tempo";
  }

  if (marketName.includes("first half") || marketName.includes("1st half")) {
    return "no 1º tempo";
  }

  return null;
}

function resolveTeamSuffix(marketName: string, candidate: RawCandidate) {
  if (/\bhome\b|mandante/.test(marketName)) {
    return `do ${candidate.homeTeam}`;
  }

  if (/\baway\b|visitante/.test(marketName)) {
    return `do ${candidate.awayTeam}`;
  }

  return null;
}

function resolveScopeLabel(
  marketName: string,
  candidate: RawCandidate,
  fallback: string,
) {
  const teamSuffix = resolveTeamSuffix(marketName, candidate);
  const periodSuffix = resolvePeriodSuffix(marketName);

  if (teamSuffix && periodSuffix) {
    return `${teamSuffix} ${periodSuffix}`;
  }

  return teamSuffix ?? periodSuffix ?? fallback;
}

function resolveRawSelectionLabel(candidate: RawCandidate) {
  return displaySelection(candidate.rawSelectionValue, candidate.homeTeam, candidate.awayTeam);
}

function inferStatsLabel(marketName: string) {
  if (/offside/i.test(marketName)) return { marketName: "Total de impedimentos", unit: "impedimento" };
  if (/pass/i.test(marketName)) return { marketName: "Total de passes", unit: "passe" };
  if (/tackle/i.test(marketName)) return { marketName: "Total de desarmes", unit: "desarme" };
  if (/interception/i.test(marketName)) return { marketName: "Total de interceptações", unit: "interceptação" };
  if (/foul/i.test(marketName)) return { marketName: "Total de faltas", unit: "falta" };
  if (/throw.?in|throw ins/i.test(marketName)) return { marketName: "Total de laterais", unit: "lateral" };
  if (/goal kicks?|goal kick/i.test(marketName)) return { marketName: "Total de tiros de meta", unit: "tiro de meta" };
  if (/save/i.test(marketName)) return { marketName: "Total de defesas", unit: "defesa" };
  if (/clearance/i.test(marketName)) return { marketName: "Total de cortes", unit: "corte" };
  if (/block/i.test(marketName)) return { marketName: "Total de bloqueios", unit: "bloqueio" };
  return { marketName: "Mercado de estatísticas", unit: "evento" };
}

function buildMarketPresentation(candidate: RawCandidate) {
  const marketName = candidate.rawMarketName.toLowerCase();
  const direction = selectionDirection(candidate.selection);
  const lineText = formatLineValue(candidate.lineValue);
  const signedLineText = formatSignedLineValue(candidate.lineValue);
  const halfLabel = marketName.includes("second half") || marketName.includes("2nd half")
    ? "2º tempo"
    : "1º tempo";
  const shotUnit = marketName.includes("target") ? "chute no alvo" : "chute";
  const selectionLower = candidate.selection.toLowerCase();
  const rawSelectionLabel = resolveRawSelectionLabel(candidate);

  if (marketName.includes("correct score")) {
    return {
      marketName:
        marketName.includes("first half") || marketName.includes("1st half")
          ? "Placar exato do 1º tempo"
          : marketName.includes("second half") || marketName.includes("2nd half")
            ? "Placar exato do 2º tempo"
            : "Placar exato",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("ht/ft") || marketName.includes("half time/full time") || marketName.includes("interval/final")) {
    return {
      marketName: "Intervalo/Final",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("qualify") || marketName.includes("advance") || marketName.includes("classify")) {
    return {
      marketName: "Classificar / Avançar",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("champion") || marketName.includes("outright")) {
    return {
      marketName: "Campeão",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("win to nil")) {
    return {
      marketName: "Vence sem sofrer gol",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("margin")) {
    return {
      marketName: "Margem de vitória",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("scorecast") || marketName.includes("wincast") || marketName.includes("timecast")) {
    return {
      marketName: "Combinação com marcador",
      selection: candidate.selection,
    };
  }

  if (candidate.marketCategory === "halves" && marketName.includes("winner")) {
    if (selectionLower === candidate.homeTeam.toLowerCase()) {
      return {
        marketName: `Vencedor do ${halfLabel}`,
        selection: `${candidate.homeTeam} vence o ${halfLabel}`,
      };
    }

    if (selectionLower === candidate.awayTeam.toLowerCase()) {
      return {
        marketName: `Vencedor do ${halfLabel}`,
        selection: `${candidate.awayTeam} vence o ${halfLabel}`,
      };
    }

    if (selectionLower === "draw" || selectionLower === "empate") {
      return {
        marketName: `Vencedor do ${halfLabel}`,
        selection: `Empate no ${halfLabel}`,
      };
    }
  }

  if (candidate.marketCategory === "halves" && marketName.includes("double chance")) {
    return {
      marketName: `Dupla chance no ${halfLabel}`,
      selection: candidate.selection,
    };
  }

  if (marketName.includes("draw no bet")) {
    return {
      marketName: "Empate anula aposta",
      selection: `${candidate.selection} com empate anulando a entrada`,
    };
  }

  if (marketName.includes("home/away")) {
    return {
      marketName: "Sem empate",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("total - away") && isOverUnderDirection(direction) && lineText) {
    return {
      marketName: "Total de gols do visitante",
      selection: buildThresholdLabel(direction, lineText, `do ${candidate.awayTeam}`, "gol"),
    };
  }

  if (marketName.includes("total - home") && isOverUnderDirection(direction) && lineText) {
    return {
      marketName: "Total de gols do mandante",
      selection: buildThresholdLabel(direction, lineText, `do ${candidate.homeTeam}`, "gol"),
    };
  }

  if (candidate.marketCategory === "team_totals" && isOverUnderDirection(direction) && lineText) {
    const teamLabel = marketName.includes("away") || selectionLower.includes(candidate.awayTeam.toLowerCase())
      ? `do ${candidate.awayTeam}`
      : marketName.includes("home") || selectionLower.includes(candidate.homeTeam.toLowerCase())
        ? `do ${candidate.homeTeam}`
        : "da equipe monitorada";

    return {
      marketName: "Total de gols por equipe",
      selection: buildThresholdLabel(direction, lineText, teamLabel, "gol"),
    };
  }

  if (marketName.includes("team to score first")) {
    return {
      marketName: "Time marca primeiro",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("team to score last")) {
    return {
      marketName: "Time marca por último",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("team to score next")) {
    return {
      marketName: "Time marca o próximo gol",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("score a goal")) {
    return {
      marketName:
        candidate.marketCategory === "halves"
          ? `${halfLabel} - time marca`
          : "Time marca",
      selection: candidate.selection,
    };
  }

  if ((marketName.includes("both teams") || marketName.includes("btts")) && direction) {
    return {
      marketName: "Ambos marcam",
      selection:
        direction === "no" ? "Ambos os times nao marcam" : "Ambos os times marcam",
    };
  }

  if (marketName.includes("to score in both halves")) {
    return {
      marketName: "Gol nos dois tempos",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("highest scoring half")) {
    return {
      marketName: "Mais gols no 1º ou 2º tempo",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("exact goals")) {
    return {
      marketName:
        candidate.marketCategory === "halves"
          ? `Total exato de gols no ${halfLabel}`
          : "Total exato de gols",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("odd/even")) {
    return {
      marketName:
        candidate.marketCategory === "corners"
          ? "Escanteios ímpar/par"
          : candidate.marketCategory === "cards"
            ? "Cartões ímpar/par"
            : "Gols ímpar/par",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("time of first goal")) {
    return {
      marketName: "Tempo do 1º gol",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("first goal scorer")) {
    return {
      marketName: "Primeiro a marcar",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("last goal scorer")) {
    return {
      marketName: "Último a marcar",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("anytime goal scorer")) {
    return {
      marketName: "Marca a qualquer momento",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("player assists")) {
    return {
      marketName: "Jogador faz assistência",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("player to be booked")) {
    return {
      marketName: "Jogador recebe cartão",
      selection: candidate.selection,
    };
  }

  if (marketName.includes("penalty")) {
    return {
      marketName: "Mercado de pênalti",
      selection: candidate.selection,
    };
  }

  if (candidate.marketCategory === "corners" && marketName.includes("race to")) {
    return {
      marketName: "Race to escanteios",
      selection: candidate.selection,
    };
  }

  if (candidate.marketCategory === "corners" && marketName.includes("next")) {
    return {
      marketName: "Próximo escanteio",
      selection: candidate.selection,
    };
  }

  if (candidate.marketCategory === "cards" && marketName.includes("first card")) {
    return {
      marketName: "Primeiro cartão",
      selection: candidate.selection,
    };
  }

  if (candidate.marketCategory === "cards" && marketName.includes("next")) {
    return {
      marketName: "Próximo cartão",
      selection: candidate.selection,
    };
  }

  if (candidate.marketCategory === "cards" && marketName.includes("red card")) {
    return {
      marketName: "Cartão vermelho no jogo",
      selection: candidate.selection,
    };
  }

  if (candidate.marketCategory === "halves" && isOverUnderDirection(direction) && lineText) {
    const unit =
      marketName.includes("corner")
        ? "escanteio"
        : marketName.includes("card")
          ? "cartao"
          : marketName.includes("shot")
            ? shotUnit
          : "gol";
    const scope = resolveScopeLabel(marketName, candidate, `no ${halfLabel}`);

    return {
      marketName: halfLabel,
      selection: buildThresholdLabel(direction, lineText, scope, unit, candidate.lineValue),
    };
  }

  if (candidate.marketCategory === "shots" && isOverUnderDirection(direction) && lineText) {
    const scope = resolveScopeLabel(marketName, candidate, "no jogo");
    return {
      marketName: marketName.includes("target")
        ? resolveTeamSuffix(marketName, candidate)
          ? "Total de chutes no alvo por equipe"
          : "Total de chutes no alvo"
        : resolveTeamSuffix(marketName, candidate)
          ? "Total de chutes por equipe"
          : "Total de chutes",
      selection: buildThresholdLabel(direction, lineText, scope, shotUnit, candidate.lineValue),
    };
  }

  if (candidate.marketCategory === "stats" && isOverUnderDirection(direction) && lineText) {
    const statLabel = inferStatsLabel(marketName);
    const scope = resolveScopeLabel(marketName, candidate, "no jogo");
    return {
      marketName: statLabel.marketName,
      selection: buildThresholdLabel(direction, lineText, scope, statLabel.unit, candidate.lineValue),
    };
  }

  if (candidate.marketCategory === "players" && isOverUnderDirection(direction) && lineText) {
    const playerScope =
      rawSelectionLabel !== candidate.selection ? `de ${rawSelectionLabel}` : "do jogador";
    if (marketName.includes("shot") && marketName.includes("target")) {
      return {
        marketName: "Jogador com chutes no alvo",
        selection: buildThresholdLabel(direction, lineText, playerScope, "chute no alvo", candidate.lineValue),
      };
    }
    if (marketName.includes("shot")) {
      return {
        marketName: "Jogador com chutes",
        selection: buildThresholdLabel(direction, lineText, playerScope, "chute", candidate.lineValue),
      };
    }
    if (marketName.includes("assist")) {
      return {
        marketName: "Jogador com assistência",
        selection: buildThresholdLabel(direction, lineText, playerScope, "assistência", candidate.lineValue),
      };
    }
    if (marketName.includes("pass")) {
      return {
        marketName: "Jogador com passes",
        selection: buildThresholdLabel(direction, lineText, playerScope, "passe", candidate.lineValue),
      };
    }
    if (marketName.includes("foul")) {
      return {
        marketName: "Jogador com faltas cometidas",
        selection: buildThresholdLabel(direction, lineText, playerScope, "falta", candidate.lineValue),
      };
    }
    if (marketName.includes("tackle")) {
      return {
        marketName: "Jogador com desarmes",
        selection: buildThresholdLabel(direction, lineText, playerScope, "desarme", candidate.lineValue),
      };
    }
    if (marketName.includes("interception")) {
      return {
        marketName: "Jogador com interceptações",
        selection: buildThresholdLabel(direction, lineText, playerScope, "interceptação", candidate.lineValue),
      };
    }
    if (marketName.includes("save")) {
      return {
        marketName: "Goleiro com defesas",
        selection: buildThresholdLabel(direction, lineText, playerScope, "defesa", candidate.lineValue),
      };
    }
  }

  if (candidate.marketCategory === "goals" && isOverUnderDirection(direction) && lineText) {
    const scope = resolveScopeLabel(marketName, candidate, "no jogo");
    return {
      marketName: "Total de gols",
      selection: buildThresholdLabel(direction, lineText, scope, "gol", candidate.lineValue),
    };
  }

  if (candidate.marketCategory === "corners" && isOverUnderDirection(direction) && lineText) {
    const scope = resolveScopeLabel(marketName, candidate, "no jogo");
    return {
      marketName: "Total de escanteios",
      selection: buildThresholdLabel(direction, lineText, scope, "escanteio", candidate.lineValue),
    };
  }

  if (candidate.marketCategory === "cards" && isOverUnderDirection(direction) && lineText) {
    const scope = resolveScopeLabel(marketName, candidate, "no jogo");
    return {
      marketName: "Total de cartões",
      selection: buildThresholdLabel(direction, lineText, scope, "cartao", candidate.lineValue),
    };
  }

  if (candidate.marketCategory === "corners") {
    return {
      marketName: "Mercado de escanteios",
      selection: rawSelectionLabel,
    };
  }

  if (candidate.marketCategory === "cards") {
    return {
      marketName: "Mercado de cartões",
      selection: rawSelectionLabel,
    };
  }

  if (candidate.marketCategory === "shots") {
    return {
      marketName: "Mercado de chutes",
      selection: rawSelectionLabel,
    };
  }

  if (candidate.marketCategory === "stats") {
    return {
      marketName: inferStatsLabel(marketName).marketName,
      selection: rawSelectionLabel,
    };
  }

  if (candidate.marketCategory === "players") {
    return {
      marketName: "Mercado de jogador",
      selection: rawSelectionLabel,
    };
  }

  if (marketName.includes("handicap")) {
    const hasEmbeddedLine = /(-?\d+(?:[.,]\d+)?)/.test(rawSelectionLabel);
    const handicapLabel =
      signedLineText && !hasEmbeddedLine ? `${rawSelectionLabel} ${signedLineText}` : rawSelectionLabel;

    return {
      marketName: marketName.includes("asian") ? "Handicap asiático" : "Handicap",
      selection: handicapLabel,
    };
  }

  if (candidate.selection === candidate.homeTeam) {
    return {
      marketName: "Resultado final",
      selection: `${candidate.homeTeam} vence o jogo`,
    };
  }

  if (candidate.selection === candidate.awayTeam) {
    return {
      marketName: "Resultado final",
      selection: `${candidate.awayTeam} vence o jogo`,
    };
  }

  if (candidate.selection.includes("ou empate")) {
    return {
      marketName: "Dupla chance",
      selection: candidate.selection,
    };
  }

  return {
    marketName: candidate.rawMarketName,
    selection: rawSelectionLabel,
  };
}

function extractLineValue(selection: unknown, handicap?: string | null) {
  const direct = parseDecimal(handicap);
  if (direct !== null) {
    return direct;
  }

  const match = String(selection).match(/(-?\d+(?:[.,]\d+)?)/);
  return match ? parseDecimal(match[1]) : null;
}

function logistic(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function buildCandidates(
  fixtures: ApiFootballFixture[],
  oddsEntries: ApiFootballOddsEntry[],
  filters: AnalysisFilters,
  options?: {
    minOdd?: number;
    maxOdd?: number;
    seedTargetOdd?: number;
  },
) {
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.fixture.id, fixture]));
  const aggregate = new Map<string, RawCandidate>();
  const minOdd = options?.minOdd ?? filters.minOdd;
  const maxOdd = options?.maxOdd ?? filters.maxOdd;
  const seedTarget = options?.seedTargetOdd ?? (minOdd + maxOdd) / 2;

  for (const entry of oddsEntries) {
    const fixture = fixturesById.get(entry.fixture.id);
    if (!fixture) continue;
    if (!isFixtureInsideWindow(entry.fixture.date, filters.scanDate, filters.horizonHours)) {
      continue;
    }
    if (filters.leagueIds.length && !filters.leagueIds.includes(fixture.league.id)) {
      continue;
    }

    for (const bookmaker of entry.bookmakers ?? []) {
      if (!isRegulatedBookmakerName(bookmaker.name)) {
        continue;
      }

      for (const bet of bookmaker.bets ?? []) {
        const category = resolveMarketCategory(bet.name);
        if (!category || !filters.marketCategories.includes(category)) {
          continue;
        }

        for (const value of bet.values ?? []) {
          const odd = parseDecimal(value.odd);
          if (odd === null || odd < minOdd || odd > maxOdd) {
            continue;
          }

          const selection = displaySelection(
            value.value,
            fixture.teams.home.name,
            fixture.teams.away.name,
          );
          const selectionKey = slugify(`${bet.id}-${value.value}-${value.handicap ?? ""}`);
          const aggregateKey = `${fixture.fixture.id}:${bet.id}:${selectionKey}`;
          const distanceFromTarget = Math.abs(odd - seedTarget);
          const seedScore =
            1.4 -
            distanceFromTarget +
            getMarketStabilityBias(category) +
            (bookmaker.name ? 0.03 : 0);

          const current = aggregate.get(aggregateKey);
          if (!current) {
            aggregate.set(aggregateKey, {
              candidateId: aggregateKey,
              fixtureId: fixture.fixture.id,
              fixtureDate: fixture.fixture.date,
              leagueId: fixture.league.id,
              leagueName: fixture.league.name,
              leagueCountry: fixture.league.country,
              season: fixture.league.season ?? env.DEFAULT_SEASON,
              round: fixture.league.round ?? "round-open",
              referee: fixture.fixture.referee ?? null,
              venueId: fixture.fixture.venue?.id ?? null,
              venueName: fixture.fixture.venue?.name ?? null,
              venueCity: fixture.fixture.venue?.city ?? null,
              marketId: bet.id,
              marketName: bet.name,
              marketCategory: category,
              selection,
              selectionKey,
              rawMarketName: bet.name,
              rawSelectionValue: String(value.value),
              rawHandicap: value.handicap ?? null,
              bestOdd: odd,
              consensusOdd: odd,
              bookmaker: bookmaker.name,
              bookmakerPool: [bookmaker.name],
              sportsbookCount: 1,
              homeTeam: fixture.teams.home.name,
              awayTeam: fixture.teams.away.name,
              homeTeamId: fixture.teams.home.id,
              awayTeamId: fixture.teams.away.id,
              lineValue: extractLineValue(value.value, value.handicap),
              seedScore,
              lineHistory: null,
            });
            continue;
          }

          current.bestOdd = Math.max(current.bestOdd, odd);
          current.consensusOdd = mean([current.consensusOdd, odd]);
          current.bookmakerPool = Array.from(new Set([...current.bookmakerPool, bookmaker.name]));
          current.sportsbookCount = current.bookmakerPool.length;
          if (odd >= current.bestOdd) {
            current.bookmaker = bookmaker.name;
          }
        }
      }
    }
  }

  return Array.from(aggregate.values())
    .map((candidate) => ({
      ...candidate,
      seedScore: candidate.seedScore + candidate.sportsbookCount * 0.05,
    }))
    .sort((left, right) => right.seedScore - left.seedScore);
}

function getFixtureResultForTeam(fixture: ApiFootballFixture, teamId: number) {
  if (fixture.goals?.home === null || fixture.goals?.away === null) {
    return null;
  }

  const isHome = fixture.teams.home.id === teamId;
  const goalsFor = isHome ? (fixture.goals?.home ?? 0) : (fixture.goals?.away ?? 0);
  const goalsAgainst = isHome ? (fixture.goals?.away ?? 0) : (fixture.goals?.home ?? 0);
  return { goalsFor, goalsAgainst };
}

function parseStatValue(value: string | number | null | undefined) {
  if (typeof value === "string" && value.includes("%")) {
    const percent = parsePercentString(value);
    return percent === null ? null : percent * 100;
  }

  return parseDecimal(value);
}

function meanNullable(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }

  return mean(filtered);
}

function getFixtureStatMap(fixture: ApiFootballFixture, teamId: number) {
  const row = fixture.statistics?.find((entry) => entry.team?.id === teamId);
  const statMap = new Map<string, number | null>();

  for (const item of row?.statistics ?? []) {
    const type = item.type?.toLowerCase();
    if (!type) continue;
    statMap.set(type, parseStatValue(item.value));
  }

  return statMap;
}

function getFixtureTotalStat(
  fixture: ApiFootballFixture,
  statName: string,
  mode: "sum" | "mean" = "sum",
) {
  const values = (fixture.statistics ?? [])
    .flatMap((entry) => entry.statistics ?? [])
    .filter((item) => item.type?.toLowerCase() === statName.toLowerCase())
    .map((item) => parseStatValue(item.value))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return mode === "mean" ? mean(values) : values.reduce((total, value) => total + value, 0);
}

function getMinuteBucketTotal(
  buckets:
    | Record<
        string,
        {
          total?: number | null;
        }
      >
    | undefined,
) {
  return Object.values(buckets ?? {}).reduce((total, bucket) => total + (bucket.total ?? 0), 0);
}

function getMinuteBucketShare(
  buckets:
    | Record<
        string,
        {
          total?: number | null;
        }
      >
    | undefined,
  bucketKeys: string[],
) {
  const total = getMinuteBucketTotal(buckets);
  if (!total) {
    return null;
  }

  const selected = bucketKeys.reduce((sum, key) => sum + (buckets?.[key]?.total ?? 0), 0);
  return selected / total;
}

function defaultTeamSnapshot(): TeamSnapshot {
  return {
    matches: 0,
    pointsPerMatch: 1.2,
    goalsForAvg: 1.15,
    goalsAgainstAvg: 1.15,
    scoringRate: 0.5,
    concedingRate: 0.5,
    over25Rate: 0.45,
    cleanSheetRate: 0.2,
    shotsAvg: 10.5,
    shotsOnTargetAvg: 3.7,
    shotsFacedAvg: 10.5,
    shotsOnTargetFacedAvg: 3.7,
    shotsInsideBoxAvg: 6.4,
    shotsInsideBoxFacedAvg: 6.4,
    cornersForAvg: 4.4,
    cornersAgainstAvg: 4.4,
    foulsAvg: 12.5,
    cardsAvg: 2.2,
    possessionAvg: null,
    passAccuracyAvg: null,
    xgAvg: null,
    xgaAvg: null,
    xgDirectCoverage: 0,
    advancedStatsCoverage: 0,
  };
}

function estimateExpectedGoals(statMap: Map<string, number | null>) {
  const totalShots = statMap.get("total shots");
  const onTarget = statMap.get("shots on goal");
  const insideBox = statMap.get("shots insidebox");
  const outsideBox = statMap.get("shots outsidebox");
  const blockedShots = statMap.get("blocked shots");

  const resolvedTotal =
    totalShots ??
    ((insideBox ?? 0) + (outsideBox ?? 0) > 0 ? (insideBox ?? 0) + (outsideBox ?? 0) : null);

  if (resolvedTotal === null) {
    return null;
  }

  const resolvedInsideBox =
    insideBox ?? Math.max((resolvedTotal * 0.58), onTarget !== null && onTarget !== undefined ? onTarget : 0);
  const resolvedOutsideBox =
    outsideBox ?? Math.max(resolvedTotal - resolvedInsideBox, 0);
  const resolvedOnTarget = onTarget ?? Math.max(resolvedTotal * 0.34, 1);
  const resolvedBlocked = blockedShots ?? Math.max(resolvedTotal - resolvedOnTarget, 0) * 0.28;

  const estimate =
    resolvedInsideBox * 0.115 +
    resolvedOutsideBox * 0.032 +
    resolvedOnTarget * 0.058 +
    resolvedBlocked * 0.012;

  return clamp(estimate, 0.08, 4.2);
}

function buildTeamSnapshot(teamId: number, fixtures: ApiFootballFixture[]): TeamSnapshot {
  const completed = fixtures
    .map((fixture) => {
      const result = getFixtureResultForTeam(fixture, teamId);
      if (!result) {
        return null;
      }

      const teamStats = getFixtureStatMap(fixture, teamId);
      const opponentId =
        fixture.teams.home.id === teamId ? fixture.teams.away.id : fixture.teams.home.id;
      const opponentStats = getFixtureStatMap(fixture, opponentId);

      return { result, teamStats, opponentStats };
    })
    .filter(
      (
        item,
      ): item is {
        result: { goalsFor: number; goalsAgainst: number };
        teamStats: Map<string, number | null>;
        opponentStats: Map<string, number | null>;
      } => Boolean(item),
    );

  if (!completed.length) {
    return defaultTeamSnapshot();
  }

  let points = 0;
  let scoringRate = 0;
  let concedingRate = 0;
  let over25Rate = 0;
  let cleanSheets = 0;
  let advancedStatsMatches = 0;
  let directXgMatches = 0;

  const shots: number[] = [];
  const shotsOnTarget: number[] = [];
  const shotsFaced: number[] = [];
  const shotsOnTargetFaced: number[] = [];
  const shotsInsideBox: number[] = [];
  const shotsInsideBoxFaced: number[] = [];
  const cornersFor: number[] = [];
  const cornersAgainst: number[] = [];
  const fouls: number[] = [];
  const cards: number[] = [];
  const possession: Array<number | null> = [];
  const passAccuracy: Array<number | null> = [];
  const xg: Array<number | null> = [];
  const xga: Array<number | null> = [];

  for (const item of completed) {
    if (item.result.goalsFor > item.result.goalsAgainst) points += 3;
    else if (item.result.goalsFor === item.result.goalsAgainst) points += 1;
    if (item.result.goalsFor > 0) scoringRate += 1;
    if (item.result.goalsAgainst > 0) concedingRate += 1;
    if (item.result.goalsFor + item.result.goalsAgainst > 2.5) over25Rate += 1;
    if (item.result.goalsAgainst === 0) cleanSheets += 1;

    const totalShots = item.teamStats.get("total shots");
    const onTarget = item.teamStats.get("shots on goal");
    const facedShots = item.opponentStats.get("total shots");
    const facedOnTarget = item.opponentStats.get("shots on goal");

    if (totalShots !== undefined || onTarget !== undefined || facedShots !== undefined) {
      advancedStatsMatches += 1;
    }

    if (totalShots !== null && totalShots !== undefined) shots.push(totalShots);
    if (onTarget !== null && onTarget !== undefined) shotsOnTarget.push(onTarget);
    if (facedShots !== null && facedShots !== undefined) shotsFaced.push(facedShots);
    if (facedOnTarget !== null && facedOnTarget !== undefined) shotsOnTargetFaced.push(facedOnTarget);

    const insideBox = item.teamStats.get("shots insidebox");
    const insideBoxFaced = item.opponentStats.get("shots insidebox");
    if (insideBox !== null && insideBox !== undefined) shotsInsideBox.push(insideBox);
    if (insideBoxFaced !== null && insideBoxFaced !== undefined) shotsInsideBoxFaced.push(insideBoxFaced);

    const corners = item.teamStats.get("corner kicks");
    const cornersFaced = item.opponentStats.get("corner kicks");
    if (corners !== null && corners !== undefined) cornersFor.push(corners);
    if (cornersFaced !== null && cornersFaced !== undefined) cornersAgainst.push(cornersFaced);

    const foulsCommitted = item.teamStats.get("fouls");
    if (foulsCommitted !== null && foulsCommitted !== undefined) fouls.push(foulsCommitted);

    const yellow = item.teamStats.get("yellow cards") ?? 0;
    const red = item.teamStats.get("red cards") ?? 0;
    cards.push(yellow + red * 1.5);

    possession.push(item.teamStats.get("ball possession") ?? null);
    passAccuracy.push(item.teamStats.get("passes %") ?? null);
    const directXg = item.teamStats.get("expected_goals");
    const directXga = item.opponentStats.get("expected_goals");
    const estimatedXg = estimateExpectedGoals(item.teamStats);
    const estimatedXga = estimateExpectedGoals(item.opponentStats);

    if (directXg !== null && directXg !== undefined) {
      directXgMatches += 1;
    }

    xg.push(directXg ?? estimatedXg);
    xga.push(directXga ?? estimatedXga);
  }

  const fallback = defaultTeamSnapshot();

  return {
    matches: completed.length,
    pointsPerMatch: points / completed.length,
    goalsForAvg: mean(completed.map((item) => item.result.goalsFor)),
    goalsAgainstAvg: mean(completed.map((item) => item.result.goalsAgainst)),
    scoringRate: scoringRate / completed.length,
    concedingRate: concedingRate / completed.length,
    over25Rate: over25Rate / completed.length,
    cleanSheetRate: cleanSheets / completed.length,
    shotsAvg: shots.length ? mean(shots) : fallback.shotsAvg,
    shotsOnTargetAvg: shotsOnTarget.length ? mean(shotsOnTarget) : fallback.shotsOnTargetAvg,
    shotsFacedAvg: shotsFaced.length ? mean(shotsFaced) : fallback.shotsFacedAvg,
    shotsOnTargetFacedAvg: shotsOnTargetFaced.length
      ? mean(shotsOnTargetFaced)
      : fallback.shotsOnTargetFacedAvg,
    shotsInsideBoxAvg: shotsInsideBox.length ? mean(shotsInsideBox) : fallback.shotsInsideBoxAvg,
    shotsInsideBoxFacedAvg: shotsInsideBoxFaced.length
      ? mean(shotsInsideBoxFaced)
      : fallback.shotsInsideBoxFacedAvg,
    cornersForAvg: cornersFor.length ? mean(cornersFor) : fallback.cornersForAvg,
    cornersAgainstAvg: cornersAgainst.length ? mean(cornersAgainst) : fallback.cornersAgainstAvg,
    foulsAvg: fouls.length ? mean(fouls) : fallback.foulsAvg,
    cardsAvg: cards.length ? mean(cards) : fallback.cardsAvg,
    possessionAvg: meanNullable(possession),
    passAccuracyAvg: meanNullable(passAccuracy),
    xgAvg: meanNullable(xg),
    xgaAvg: meanNullable(xga),
    xgDirectCoverage: directXgMatches / completed.length,
    advancedStatsCoverage: advancedStatsMatches / completed.length,
  };
}

function getStandingPointsPerMatch(
  standing: ApiFootballStandingEntry | null,
  side: "home" | "away" | "all",
) {
  const row = standing?.[side];
  if (!row?.played) {
    return null;
  }

  return ((row.win ?? 0) * 3 + (row.draw ?? 0)) / row.played;
}

function getStandingGoalsAverage(
  standing: ApiFootballStandingEntry | null,
  side: "home" | "away" | "all",
  direction: "for" | "against",
) {
  const row = standing?.[side];
  if (!row?.played) {
    return null;
  }

  return ((direction === "for" ? row.goals?.for : row.goals?.against) ?? 0) / row.played;
}

function simplifyPlayers(
  players: ApiFootballPlayer[],
  leagueId: number,
  season: number,
  teamId: number,
) {
  return players
    .map((entry) => {
      const stat = entry.statistics?.find(
        (item) =>
          item.team?.id === teamId &&
          item.league?.id === leagueId &&
          item.league?.season === season,
      );

      if (!stat || !entry.player?.id || !entry.player.name) {
        return null;
      }

      return {
        id: entry.player.id,
        name: entry.player.name,
        position: stat.games?.position ?? null,
        minutes: stat.games?.minutes ?? 0,
        appearances: stat.games?.appearences ?? 0,
        lineups: stat.games?.lineups ?? 0,
        rating: parseDecimal(stat.games?.rating ?? null),
        shots: stat.shots?.total ?? 0,
        shotsOnTarget: stat.shots?.on ?? 0,
        goals: stat.goals?.total ?? 0,
        assists: stat.goals?.assists ?? 0,
        keyPasses: stat.passes?.key ?? 0,
        passes: stat.passes?.total ?? 0,
        passAccuracy: stat.passes?.accuracy ?? null,
        tackles: stat.tackles?.total ?? 0,
        interceptions: stat.tackles?.interceptions ?? 0,
        duelsWon: stat.duels?.won ?? 0,
        dribblesSuccess: stat.dribbles?.success ?? 0,
        yellow: stat.cards?.yellow ?? 0,
        red: stat.cards?.red ?? 0,
        injured: entry.player.injured ?? false,
      } satisfies SimplifiedPlayer;
    })
    .filter((player): player is SimplifiedPlayer => Boolean(player))
    .sort((left, right) => right.minutes - left.minutes);
}

function per90(value: number, minutes: number) {
  if (!minutes) {
    return 0;
  }

  return (value / minutes) * 90;
}

function pickLeader(
  players: SimplifiedPlayer[],
  selector: (player: SimplifiedPlayer) => number,
  minMinutes = 240,
) {
  const eligible = players.filter((player) => player.minutes >= minMinutes);
  if (!eligible.length) {
    return null;
  }

  return [...eligible].sort((left, right) => selector(right) - selector(left))[0] ?? null;
}

function buildStarterFrequency(teamId: number, fixtures: ApiFootballFixture[]) {
  const starts = new Map<number, { name: string; starts: number }>();

  for (const fixture of fixtures.slice(0, 5)) {
    const lineup = fixture.lineups?.find((entry) => entry.team?.id === teamId);

    for (const item of lineup?.startXI ?? []) {
      const playerId = item.player?.id;
      const playerName = item.player?.name;
      if (!playerId || !playerName) continue;

      const current = starts.get(playerId);
      if (!current) {
        starts.set(playerId, { name: playerName, starts: 1 });
        continue;
      }

      current.starts += 1;
    }
  }

  return starts;
}

function buildStyleTags(snapshot: TeamSnapshot) {
  const tags: string[] = [];

  if ((snapshot.possessionAvg ?? 0) >= 53) tags.push("posse alta");
  if ((snapshot.possessionAvg ?? 50) <= 47 && snapshot.shotsOnTargetAvg >= 4) tags.push("ataque mais direto");
  if (snapshot.cornersForAvg >= 5.4) tags.push("gera volume de bola parada");
  if (snapshot.shotsInsideBoxAvg >= 8) tags.push("ataca bastante a area");
  if (snapshot.shotsOnTargetFacedAvg <= 3.3) tags.push("protege bem o alvo");

  return tags.slice(0, 3);
}

function buildDependencyNotes(players: SimplifiedPlayer[]) {
  const notes: string[] = [];
  const finishers = [...players]
    .filter((player) => player.minutes >= 350)
    .sort((left, right) => per90(right.shots, right.minutes) - per90(left.shots, left.minutes));
  const creators = [...players]
    .filter((player) => player.minutes >= 350)
    .sort((left, right) => per90(right.keyPasses, right.minutes) - per90(left.keyPasses, left.minutes));

  if (finishers[0] && finishers[1]) {
    const top = per90(finishers[0].shots, finishers[0].minutes);
    const second = per90(finishers[1].shots, finishers[1].minutes);
    if (top >= 2.7 && top > second * 1.45) {
      notes.push(`Ataque muito apoiado em ${finishers[0].name} para finalizar.`);
    }
  }

  if (creators[0] && creators[1]) {
    const top = per90(creators[0].keyPasses, creators[0].minutes);
    const second = per90(creators[1].keyPasses, creators[1].minutes);
    if (top >= 1.5 && top > second * 1.45) {
      notes.push(`Criacao passa bastante por ${creators[0].name}.`);
    }
  }

  return notes.slice(0, 2);
}

function buildStructuralAbsences(
  players: SimplifiedPlayer[],
  injuries: ApiFootballInjury[],
  starterFrequency: Map<number, { name: string; starts: number }>,
) {
  const injuredNames = new Set(
    injuries
      .map((injury) => injury.player?.name?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );

  return players
    .filter(
      (player) =>
        injuredNames.has(player.name.trim().toLowerCase()) &&
        (player.minutes >= 900 ||
          (starterFrequency.get(player.id)?.starts ?? 0) >= 3 ||
          player.goals + player.assists >= 5 ||
          player.keyPasses >= 10 ||
          player.tackles + player.interceptions >= 30),
    )
    .slice(0, 3)
    .map((player) => `${player.name} fora`);
}

function buildLikelySuspensions(teamId: number, fixtures: ApiFootballFixture[]) {
  const latest = fixtures
    .filter((fixture) => fixture.fixture.status?.short === "FT")
    .sort(
      (left, right) =>
        new Date(right.fixture.date).getTime() - new Date(left.fixture.date).getTime(),
    )[0];

  if (!latest) {
    return [];
  }

  return (latest.events ?? [])
    .filter((event) => event.team?.id === teamId && event.type?.toLowerCase() === "card")
    .filter((event) => {
      const detail = event.detail?.toLowerCase() ?? "";
      return detail.includes("red") || detail.includes("second yellow");
    })
    .map((event) => event.player?.name?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, 2)
    .map((name) => `${name} saiu do ultimo jogo por expulsao e pode cumprir suspensao`);
}

function buildBenchNote(
  players: SimplifiedPlayer[],
  lineup: ApiFootballLineup | undefined,
) {
  if (!lineup?.substitutes?.length) {
    return null;
  }

  const deepBench = lineup.substitutes.reduce((total, item) => {
    const playerId = item.player?.id;
    const player = players.find((entry) => entry.id === playerId);
    return total + (player && (player.minutes >= 600 || player.appearances >= 10) ? 1 : 0);
  }, 0);

  if (deepBench >= 4) {
    return "Banco com reposicao real.";
  }

  if (deepBench >= 2) {
    return "Banco funcional, mas sem muita sobra de nivel.";
  }

  return "Banco curto para mexer sem perder nivel.";
}

function getDaysBetween(fromDate: string, toDate: string) {
  const diff = new Date(toDate).getTime() - new Date(fromDate).getTime();
  return diff / (1000 * 60 * 60 * 24);
}

function buildTeamProfile({
  candidate,
  teamId,
  teamName,
  side,
  lineup,
  injuries,
  teamContext,
}: {
  candidate: EnrichedCandidate;
  teamId: number;
  teamName: string;
  side: "home" | "away";
  lineup: ApiFootballLineup | undefined;
  injuries: ApiFootballInjury[];
  teamContext: TeamContext;
}) {
  const recentDetailed = [...teamContext.recentDetailedFixtures].sort(
    (left, right) =>
      new Date(right.fixture.date).getTime() - new Date(left.fixture.date).getTime(),
  );
  const recentBasic = [...teamContext.recentFixtures].sort(
    (left, right) =>
      new Date(right.fixture.date).getTime() - new Date(left.fixture.date).getTime(),
  );
  const recent5 = buildTeamSnapshot(teamId, recentDetailed.slice(0, 5));
  const recent10 = buildTeamSnapshot(teamId, recentDetailed.slice(0, 10));
  const season = teamContext.seasonStats?.league?.season ?? candidate.season;
  const players = simplifyPlayers(teamContext.players, candidate.leagueId, season, teamId);
  const starterFrequency = buildStarterFrequency(teamId, recentDetailed);
  const structuralAbsences = buildStructuralAbsences(players, injuries, starterFrequency);
  const likelySuspensions = buildLikelySuspensions(teamId, recentDetailed);
  const benchNote = buildBenchNote(players, lineup);
  const topFinisher = pickLeader(players, (player) => per90(player.shotsOnTarget + player.goals, player.minutes));
  const topCreator = pickLeader(players, (player) => per90(player.keyPasses + player.assists, player.minutes));
  const topShield = pickLeader(players, (player) => per90(player.tackles + player.interceptions + player.duelsWon * 0.35, player.minutes));
  const topConductor = pickLeader(players, (player) => per90(player.passes, player.minutes) + (player.passAccuracy ?? 0) * 0.05);
  const topSetPiece = topCreator ?? topFinisher;
  const dependencyNotes = buildDependencyNotes(players);
  const sidePointsPerMatch = getStandingPointsPerMatch(teamContext.standing, side) ?? recent10.pointsPerMatch;
  const overallPointsPerMatch = getStandingPointsPerMatch(teamContext.standing, "all") ?? recent10.pointsPerMatch;
  const sideGoalsForAvg = getStandingGoalsAverage(teamContext.standing, side, "for") ?? recent10.goalsForAvg;
  const sideGoalsAgainstAvg = getStandingGoalsAverage(teamContext.standing, side, "against") ?? recent10.goalsAgainstAvg;
  const overallGoalsForAvg =
    parseDecimal(teamContext.seasonStats?.goals?.for?.average?.total ?? null) ?? recent10.goalsForAvg;
  const overallGoalsAgainstAvg =
    parseDecimal(teamContext.seasonStats?.goals?.against?.average?.total ?? null) ?? recent10.goalsAgainstAvg;
  const playedTotal =
    teamContext.seasonStats?.fixtures?.played?.total ?? teamContext.standing?.all?.played ?? 0;
  const cleanSheetRate = playedTotal
    ? (teamContext.seasonStats?.clean_sheet?.total ?? 0) / playedTotal
    : recent10.cleanSheetRate;
  const failedToScoreRate = playedTotal
    ? (teamContext.seasonStats?.failed_to_score?.total ?? 0) / playedTotal
    : 1 - recent10.scoringRate;
  const penaltiesScored = teamContext.seasonStats?.penalty?.scored?.total ?? 0;
  const yellowCardsTotal = getMinuteBucketTotal(teamContext.seasonStats?.cards?.yellow);
  const redCardsTotal = getMinuteBucketTotal(teamContext.seasonStats?.cards?.red);
  const earlyScoringShare = getMinuteBucketShare(teamContext.seasonStats?.goals?.for?.minute, ["0-15", "16-30"]);
  const lateScoringShare = getMinuteBucketShare(teamContext.seasonStats?.goals?.for?.minute, ["76-90", "91-105", "106-120"]);
  const earlyConcedingShare = getMinuteBucketShare(teamContext.seasonStats?.goals?.against?.minute, ["0-15", "16-30"]);
  const lateConcedingShare = getMinuteBucketShare(teamContext.seasonStats?.goals?.against?.minute, ["76-90", "91-105", "106-120"]);
  const recentBeforeKickoff = recentBasic.filter(
    (fixture) => new Date(fixture.fixture.date).getTime() < new Date(candidate.fixtureDate).getTime(),
  );
  const lastPlayed = recentBeforeKickoff[0];
  const restDays = lastPlayed ? getDaysBetween(lastPlayed.fixture.date, candidate.fixtureDate) : null;
  const gamesLast14 = recentBeforeKickoff.filter(
    (fixture) => getDaysBetween(fixture.fixture.date, candidate.fixtureDate) <= 14,
  ).length;
  const nextAfterKickoff = teamContext.nextFixtures
    .filter(
      (fixture) =>
        fixture.fixture.id !== candidate.fixtureId &&
        new Date(fixture.fixture.date).getTime() > new Date(candidate.fixtureDate).getTime(),
    )
    .sort(
      (left, right) =>
        new Date(left.fixture.date).getTime() - new Date(right.fixture.date).getTime(),
    )[0];
  const nextGameGapDays = nextAfterKickoff ? getDaysBetween(candidate.fixtureDate, nextAfterKickoff.fixture.date) : null;
  const travelNote =
    restDays !== null &&
    restDays <= 3.5 &&
    lastPlayed &&
    lastPlayed.league.id !== candidate.leagueId &&
    lastPlayed.league.country !== candidate.leagueCountry
      ? `Vem de agenda apertada com deslocamento recente por ${lastPlayed.league.country}.`
      : null;

  return {
    teamId,
    teamName,
    standing: teamContext.standing,
    seasonStats: teamContext.seasonStats,
    recent5,
    recent10,
    sidePointsPerMatch,
    overallPointsPerMatch,
    sideGoalsForAvg,
    sideGoalsAgainstAvg,
    overallGoalsForAvg,
    overallGoalsAgainstAvg,
    cleanSheetRate,
    failedToScoreRate,
    penaltiesScored,
    yellowCardsTotal,
    redCardsTotal,
    formString: teamContext.seasonStats?.form ?? teamContext.standing?.form ?? null,
    styleTags: buildStyleTags(recent10),
    dominantFormations: (teamContext.seasonStats?.lineups ?? [])
      .slice()
      .sort((left, right) => (right.played ?? 0) - (left.played ?? 0))
      .map((item) => item.formation ?? "sem formacao")
      .slice(0, 2),
    structuralAbsences,
    likelySuspensions,
    benchNote,
    dependencyNotes,
    players,
    topFinisher,
    topCreator,
    topShield,
    topConductor,
    topSetPiece,
    restDays,
    gamesLast14,
    nextGameGapDays,
    nextGameLabel: nextAfterKickoff
      ? `${nextAfterKickoff.league.name} • ${nextAfterKickoff.league.round ?? "proxima rodada"}`
      : null,
    travelNote,
    earlyScoringShare,
    lateScoringShare,
    earlyConcedingShare,
    lateConcedingShare,
    lineupStatus: lineup ? "confirmed" : starterFrequency.size ? "projected" : "unknown",
  } satisfies TeamProfile;
}

function derivePerspective(candidate: RawCandidate) {
  const selection = candidate.selection.toLowerCase();
  const marketName = candidate.marketName.toLowerCase();
  const homeName = candidate.homeTeam.toLowerCase();
  const awayName = candidate.awayTeam.toLowerCase();

  if (selection === homeName) return "home";
  if (selection === awayName) return "away";
  if (selection.includes("ou empate")) {
    return selection.includes(homeName) ? "home_or_draw" : "away_or_draw";
  }
  if (selection.includes(homeName)) return "home";
  if (selection.includes(awayName)) return "away";
  if (selection.startsWith("over")) return "over";
  if (selection.startsWith("under")) return "under";
  if (selection === "yes" || selection.includes("sim")) {
    return marketName.includes("both") ? "btts_yes" : "generic_yes";
  }
  if (selection === "no" || selection.includes("nao")) {
    return marketName.includes("both") ? "btts_no" : "generic_no";
  }
  if (marketName.includes("both teams")) {
    return selection.includes("yes") ? "btts_yes" : "btts_no";
  }
  return "generic";
}

function computeQuality(context: FixtureContext) {
  let score = 0.34;
  if (context.prediction) score += 0.12;
  if (context.lineups.length) score += 0.12;
  if (context.injuries.length) score += 0.1;
  if (context.h2h.length) score += 0.06;
  if (context.standings.length) score += 0.08;
  if (context.weather) score += 0.05;
  if (context.venueProfile) score += 0.04;
  if (context.refereeProfile) score += 0.03;
  if (context.home.recentDetailedFixtures.length >= 5 && context.away.recentDetailedFixtures.length >= 5) {
    score += 0.14;
  }
  if (context.home.seasonStats && context.away.seasonStats) score += 0.12;
  if (context.home.players.length && context.away.players.length) score += 0.08;
  return clamp(score, 0.3, 0.96);
}

function toneSection(
  id: AnalysisSection["id"],
  label: string,
  tone: AnalysisSection["tone"],
  bullets: Array<string | null | undefined>,
) {
  const compact = bullets
    .filter((bullet): bullet is string => Boolean(bullet))
    .map((bullet) => bullet.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!compact.length) {
    return null;
  }

  return {
    id,
    label,
    tone,
    bullets: compact.slice(0, 3),
  } satisfies AnalysisSection;
}

function pickContextPressure(profile: TeamProfile, standings: ApiFootballStandingEntry[]) {
  if (!profile.standing) {
    return null;
  }

  const first = standings[0];
  const teamsCount = standings.length;
  const rank = profile.standing.rank ?? 0;
  const description = profile.standing.description ?? "";

  if (/relegation/i.test(description) || (teamsCount >= 18 && rank >= teamsCount - 3)) {
    return `${profile.teamName} vive pressao real na parte de baixo da tabela.`;
  }

  if (/champions league|europa|conference|promotion/i.test(description)) {
    return `${profile.teamName} entra com peso de tabela por vaga importante.`;
  }

  if ((profile.standing.points ?? 0) && first?.points && first.points - (profile.standing.points ?? 0) <= 6 && rank <= 4) {
    return `${profile.teamName} segue colado na parte alta da competicao.`;
  }

  return null;
}

function findReferencedPlayer(selection: string, players: SimplifiedPlayer[]) {
  const normalized = selection.toLowerCase();
  return players.find((player) => normalized.includes(player.name.toLowerCase()));
}

function buildVenueProfile(fixtures: ApiFootballFixture[], venueId: number | null): VenueProfile | null {
  if (!venueId || !fixtures.length) {
    return null;
  }

  const completed = fixtures.filter(
    (fixture) =>
      fixture.fixture.venue?.id === venueId &&
      fixture.goals?.home !== null &&
      fixture.goals?.away !== null,
  );

  if (!completed.length) {
    return null;
  }

  let homeWins = 0;
  const goals: number[] = [];
  const corners: number[] = [];
  const cards: number[] = [];

  for (const fixture of completed) {
    const homeGoals = fixture.goals?.home ?? 0;
    const awayGoals = fixture.goals?.away ?? 0;
    goals.push(homeGoals + awayGoals);
    if (homeGoals > awayGoals) {
      homeWins += 1;
    }

    const totalCorners = getFixtureTotalStat(fixture, "corner kicks");
    const totalCards =
      (getFixtureTotalStat(fixture, "yellow cards") ?? 0) +
      (getFixtureTotalStat(fixture, "red cards") ?? 0);
    if (totalCorners !== null) corners.push(totalCorners);
    if (totalCards !== null) cards.push(totalCards);
  }

  return {
    venueId,
    samples: completed.length,
    goalsAvg: mean(goals),
    cornersAvg: corners.length ? mean(corners) : null,
    cardsAvg: cards.length ? mean(cards) : null,
    homeWinRate: homeWins / completed.length,
  };
}

function buildRefereeProfile(refereeName: string | null | undefined, fixtures: ApiFootballFixture[]): RefereeProfile | null {
  if (!refereeName) {
    return null;
  }

  const matches = fixtures.filter(
    (fixture) =>
      fixture.fixture.referee?.trim().toLowerCase() === refereeName.trim().toLowerCase() &&
      fixture.fixture.status?.short === "FT",
  );

  if (!matches.length) {
    return null;
  }

  const yellowTotals: number[] = [];
  const redTotals: number[] = [];
  const foulTotals: number[] = [];
  let over45CardsMatches = 0;
  let homeWins = 0;

  for (const fixture of matches) {
    const yellow = getFixtureTotalStat(fixture, "yellow cards");
    const red = getFixtureTotalStat(fixture, "red cards");
    const fouls = getFixtureTotalStat(fixture, "fouls");
    if (yellow !== null) yellowTotals.push(yellow);
    if (red !== null) redTotals.push(red);
    if (fouls !== null) foulTotals.push(fouls);
    if ((yellow ?? 0) + (red ?? 0) >= 5) {
      over45CardsMatches += 1;
    }

    if ((fixture.goals?.home ?? 0) > (fixture.goals?.away ?? 0)) {
      homeWins += 1;
    }
  }

  return {
    refereeName,
    samples: matches.length,
    yellowAvg: yellowTotals.length ? mean(yellowTotals) : null,
    redAvg: redTotals.length ? mean(redTotals) : null,
    foulsAvg: foulTotals.length ? mean(foulTotals) : null,
    homeBias: homeWins / matches.length,
    over45CardsRate: matches.length ? over45CardsMatches / matches.length : null,
  };
}

function inferCompetitiveContext(
  candidate: RawCandidate,
  standings: ApiFootballStandingEntry[],
  homeProfile: TeamProfile,
  awayProfile: TeamProfile,
  h2h: ApiFootballFixture[],
): CompetitiveContext {
  const competitionLabel = candidate.leagueName.toLowerCase();
  const knockoutHints = ["semi", "quarter", "round of 16", "play-off", "1st round", "2nd round", "3rd round", "final"];
  const roundText = candidate.round.toLowerCase();

  let competitionType: CompetitiveContext["competitionType"] = "copa";
  if (/friendly/.test(competitionLabel)) {
    competitionType = "amistoso";
  } else if (standings.length && /regular season|serie a|premier league|la liga|bundesliga|ligue 1/.test(competitionLabel)) {
    competitionType = "pontos-corridos";
  } else if (/group/.test(roundText)) {
    competitionType = "fase-de-grupos";
  } else if (knockoutHints.some((hint) => roundText.includes(hint))) {
    competitionType = "mata-mata";
  }

  let tieStage: CompetitiveContext["tieStage"] = "nao-aplicavel";
  let aggregateNote: string | null = null;

  if (competitionType === "mata-mata") {
    const sameCompetitionH2H = h2h
      .filter(
        (fixture) =>
          fixture.league.id === candidate.leagueId &&
          fixture.league.season === candidate.season &&
          new Date(fixture.fixture.date).getTime() < new Date(candidate.fixtureDate).getTime(),
      )
      .sort(
        (left, right) =>
          new Date(right.fixture.date).getTime() - new Date(left.fixture.date).getTime(),
      );

    const previousLeg = sameCompetitionH2H[0];
    if (previousLeg) {
      tieStage = "volta";
      const homeGoals = previousLeg.teams.home.id === candidate.homeTeamId ? previousLeg.goals?.home ?? 0 : previousLeg.goals?.away ?? 0;
      const awayGoals = previousLeg.teams.home.id === candidate.awayTeamId ? previousLeg.goals?.home ?? 0 : previousLeg.goals?.away ?? 0;
      aggregateNote = `Ha perna anterior recente: agregado parcial ${candidate.homeTeam} ${homeGoals} x ${awayGoals} ${candidate.awayTeam}.`;
    } else {
      tieStage = "ida";
    }
  } else if (competitionType === "copa") {
    tieStage = "jogo-unico";
  }

  let importanceNote: string | null = null;
  const homePressure = pickContextPressure(homeProfile, standings);
  const awayPressure = pickContextPressure(awayProfile, standings);
  if (homePressure || awayPressure) {
    importanceNote = [homePressure, awayPressure].filter(Boolean).join(" ");
  }

  const nextGameRiskNote = [
    homeProfile.nextGameGapDays !== null && homeProfile.nextGameGapDays <= 4
      ? `${candidate.homeTeam} pode gerir carga porque joga de novo em ${homeProfile.nextGameGapDays.toFixed(1)} dias.`
      : null,
    awayProfile.nextGameGapDays !== null && awayProfile.nextGameGapDays <= 4
      ? `${candidate.awayTeam} pode gerir carga porque joga de novo em ${awayProfile.nextGameGapDays.toFixed(1)} dias.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    competitionType,
    tieStage,
    aggregateNote,
    importanceNote,
    nextGameRiskNote: nextGameRiskNote || null,
    derbyNote: null,
  };
}

function describeWeatherCode(weatherCode: number | null | undefined) {
  if (weatherCode === null || weatherCode === undefined) {
    return null;
  }

  if (weatherCode === 0) return "ceu limpo";
  if ([1, 2, 3].includes(weatherCode)) return "nuvens variaveis";
  if ([45, 48].includes(weatherCode)) return "nevoa";
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "chuvisco";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return "chuva";
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "neve";
  if ([95, 96, 99].includes(weatherCode)) return "tempestade";
  return "tempo instavel";
}

function getWeatherRiskFlags(weather: WeatherSnapshot | null) {
  if (!weather) {
    return {
      caution: [] as string[],
      support: [] as string[],
    };
  }

  const caution: string[] = [];
  const support: string[] = [];
  const precipitationProbability = weather.precipitationProbability ?? 0;
  const precipitationMm = weather.precipitationMm ?? 0;
  const windSpeed = weather.windSpeedKmh ?? 0;
  const gusts = weather.windGustsKmh ?? 0;
  const temperature = weather.temperatureC ?? weather.apparentTemperatureC ?? null;
  const weatherDescription = describeWeatherCode(weather.weatherCode);

  if (precipitationProbability >= 60 || precipitationMm >= 1.2) {
    caution.push("Clima aponta boa chance de chuva perto do jogo, o que pode mexer no ritmo tecnico.");
  }

  if (windSpeed >= 24 || gusts >= 38) {
    caution.push("Vento forte previsto, com potencial para afetar bola longa, cruzamentos e finalizacao.");
  }

  if (temperature !== null && temperature >= 30) {
    caution.push("Calor alto previsto, com risco de jogo mais travado fisicamente em parte da partida.");
  }

  if (!caution.length && weatherDescription) {
    support.push(`Previsao sem alerta forte de clima: ${weatherDescription}.`);
  }

  return { caution, support };
}

function buildLineMovement(candidate: RawCandidate): LineMovementSnapshot | null {
  const history = candidate.lineHistory;
  if (!history) {
    return {
      openingOdd: null,
      previousOdd: null,
      currentOdd: candidate.bestOdd,
      deltaFromOpen: null,
      deltaFromPrevious: null,
      trend: "new",
      sampleCount: 0,
      signal: "Primeira captura salva para esta linha.",
    };
  }

  const deltaFromOpen =
    history.openingOdd !== null ? candidate.bestOdd - history.openingOdd : null;
  const deltaFromPrevious =
    history.previousOdd !== null ? candidate.bestOdd - history.previousOdd : null;

  let trend: LineMovementSnapshot["trend"] = "flat";
  if (deltaFromPrevious === null && deltaFromOpen === null) {
    trend = "new";
  } else {
    const movement = deltaFromPrevious ?? deltaFromOpen ?? 0;
    if (movement <= -0.05) trend = "steam";
    else if (movement >= 0.05) trend = "drift";
  }

  const signal =
    trend === "steam"
      ? "A odd caiu desde as capturas anteriores, sinal de dinheiro informado entrando nessa selecao."
      : trend === "drift"
        ? "A odd abriu mais alta no recorte recente, indicando menor suporte de mercado agora."
        : history.sampleCount >= 2
          ? "Mercado relativamente estavel entre as capturas salvas."
          : "Ainda existe pouco historico salvo para medir movimento com conviccao.";

  return {
    openingOdd: history.openingOdd,
    previousOdd: history.previousOdd,
    currentOdd: candidate.bestOdd,
    deltaFromOpen,
    deltaFromPrevious,
    trend,
    sampleCount: history.sampleCount,
    signal,
  };
}

function resolveXgSource(homeProfile: TeamProfile, awayProfile: TeamProfile): XgContextSnapshot["source"] {
  const homeCoverage = homeProfile.recent10.xgDirectCoverage;
  const awayCoverage = awayProfile.recent10.xgDirectCoverage;

  if (homeCoverage >= 0.6 && awayCoverage >= 0.6) {
    return "feed";
  }

  if (homeCoverage <= 0.1 && awayCoverage <= 0.1) {
    return "estimated";
  }

  if ((homeProfile.recent10.xgAvg ?? null) === null || (awayProfile.recent10.xgAvg ?? null) === null) {
    return "proxy";
  }

  return "mixed";
}

function scoreCandidate(candidate: EnrichedCandidate, calibration: CalibrationProfile | null): AnalysisPick {
  const presentation = buildMarketPresentation(candidate);
  const lineMovement = buildLineMovement(candidate);
  const implied = 1 / candidate.bestOdd;
  const quality = computeQuality(candidate.context);
  const perspective = derivePerspective(candidate);
  const predictionHome = parsePercentString(candidate.context.prediction?.predictions?.percent?.home);
  const predictionDraw = parsePercentString(candidate.context.prediction?.predictions?.percent?.draw);
  const predictionAway = parsePercentString(candidate.context.prediction?.predictions?.percent?.away);
  const homeLineup = candidate.context.lineups.find((lineup) => lineup.team?.id === candidate.homeTeamId);
  const awayLineup = candidate.context.lineups.find((lineup) => lineup.team?.id === candidate.awayTeamId);
  const homeInjuries = candidate.context.injuries.filter((injury) => injury.team?.id === candidate.homeTeamId);
  const awayInjuries = candidate.context.injuries.filter((injury) => injury.team?.id === candidate.awayTeamId);
  const homeProfile = buildTeamProfile({
    candidate,
    teamId: candidate.homeTeamId,
    teamName: candidate.homeTeam,
    side: "home",
    lineup: homeLineup,
    injuries: homeInjuries,
    teamContext: candidate.context.home,
  });
  const awayProfile = buildTeamProfile({
    candidate,
    teamId: candidate.awayTeamId,
    teamName: candidate.awayTeam,
    side: "away",
    lineup: awayLineup,
    injuries: awayInjuries,
    teamContext: candidate.context.away,
  });

  const lineupsReady = homeProfile.lineupStatus === "confirmed" || awayProfile.lineupStatus === "confirmed";
  const formGap10 = homeProfile.recent10.pointsPerMatch - awayProfile.recent10.pointsPerMatch;
  const formGap5 = homeProfile.recent5.pointsPerMatch - awayProfile.recent5.pointsPerMatch;
  const sideGap = homeProfile.sidePointsPerMatch - awayProfile.sidePointsPerMatch;
  const attackMatchupGap =
    (homeProfile.recent10.shotsOnTargetAvg - awayProfile.recent10.shotsOnTargetFacedAvg) -
    (awayProfile.recent10.shotsOnTargetAvg - homeProfile.recent10.shotsOnTargetFacedAvg);
  const goalMatchupGap =
    (homeProfile.overallGoalsForAvg - awayProfile.overallGoalsAgainstAvg) -
    (awayProfile.overallGoalsForAvg - homeProfile.overallGoalsAgainstAvg);
  const structuralGap = awayProfile.structuralAbsences.length - homeProfile.structuralAbsences.length;
  const combinedGoalsProjection =
    (homeProfile.recent10.goalsForAvg +
      awayProfile.recent10.goalsForAvg +
      homeProfile.recent10.goalsAgainstAvg +
      awayProfile.recent10.goalsAgainstAvg) /
    2;
  const combinedShotsOnTarget =
    homeProfile.recent10.shotsOnTargetAvg +
    awayProfile.recent10.shotsOnTargetAvg +
    homeProfile.recent10.shotsOnTargetFacedAvg +
    awayProfile.recent10.shotsOnTargetFacedAvg;
  const combinedCornersProjection =
    (homeProfile.recent10.cornersForAvg +
      awayProfile.recent10.cornersForAvg +
      homeProfile.recent10.cornersAgainstAvg +
      awayProfile.recent10.cornersAgainstAvg) /
    2;
  const combinedCardsProjection = homeProfile.recent10.cardsAvg + awayProfile.recent10.cardsAvg;
  const bttsProjection =
    (homeProfile.recent10.scoringRate +
      awayProfile.recent10.scoringRate +
      homeProfile.recent10.concedingRate +
      awayProfile.recent10.concedingRate) /
    4;
  const xgCombined =
    homeProfile.recent10.xgAvg !== null &&
    awayProfile.recent10.xgAvg !== null &&
    homeProfile.recent10.xgaAvg !== null &&
    awayProfile.recent10.xgaAvg !== null
      ? (homeProfile.recent10.xgAvg +
          awayProfile.recent10.xgAvg +
          homeProfile.recent10.xgaAvg +
          awayProfile.recent10.xgaAvg) /
        2
      : null;
  const advancedFeedAvailable =
    homeProfile.recent10.advancedStatsCoverage >= 0.5 ||
    awayProfile.recent10.advancedStatsCoverage >= 0.5;
  const competitiveContext = inferCompetitiveContext(
    candidate,
    candidate.context.standings,
    homeProfile,
    awayProfile,
    candidate.context.h2h,
  );
  const venueGoalsAvg = candidate.context.venueProfile?.goalsAvg;
  const venueCornersAvg = candidate.context.venueProfile?.cornersAvg;
  const refereeYellowAvg = candidate.context.refereeProfile?.yellowAvg;
  const refereeRedAvg = candidate.context.refereeProfile?.redAvg;
  const refereeOver45Rate = candidate.context.refereeProfile?.over45CardsRate;
  const weather = candidate.context.weather;
  const weatherFlags = getWeatherRiskFlags(weather);
  const weatherRainRisk =
    (weather?.precipitationProbability ?? 0) >= 60 || (weather?.precipitationMm ?? 0) >= 1.2;
  const weatherWindRisk =
    (weather?.windSpeedKmh ?? 0) >= 24 || (weather?.windGustsKmh ?? 0) >= 38;
  const weatherHeatRisk =
    (weather?.temperatureC ?? weather?.apparentTemperatureC ?? 0) >= 30;
  const xgContext: XgContextSnapshot = {
    homeFor: homeProfile.recent10.xgAvg,
    homeAgainst: homeProfile.recent10.xgaAvg,
    awayFor: awayProfile.recent10.xgAvg,
    awayAgainst: awayProfile.recent10.xgaAvg,
    combinedProjection: xgCombined,
    source: resolveXgSource(homeProfile, awayProfile),
  };
  const refereeStats: RefereeStatsSnapshot | null = candidate.context.refereeProfile
    ? {
        refereeName: candidate.context.refereeProfile.refereeName,
        samples: candidate.context.refereeProfile.samples,
        yellowAvg: candidate.context.refereeProfile.yellowAvg,
        redAvg: candidate.context.refereeProfile.redAvg,
        foulsAvg: candidate.context.refereeProfile.foulsAvg,
        over45CardsRate: candidate.context.refereeProfile.over45CardsRate,
      }
    : null;

  let modelProbability = implied;
  let predictionPulse = "mercado em leitura expandida";

  switch (perspective) {
    case "home":
      modelProbability +=
        sideGap * 0.09 +
        formGap10 * 0.07 +
        formGap5 * 0.05 +
        goalMatchupGap * 0.05 +
        attackMatchupGap * 0.018 +
        structuralGap * 0.012;
      if (predictionHome !== null) modelProbability = modelProbability * 0.62 + predictionHome * 0.38;
      predictionPulse = "mandante cruza melhor contexto de tabela, mando e matchup";
      break;
    case "away":
      modelProbability +=
        -sideGap * 0.09 -
        formGap10 * 0.07 -
        formGap5 * 0.05 -
        goalMatchupGap * 0.05 -
        attackMatchupGap * 0.018 -
        structuralGap * 0.012;
      if (predictionAway !== null) modelProbability = modelProbability * 0.62 + predictionAway * 0.38;
      predictionPulse = "visitante tem sinais suficientes para competir acima do mercado";
      break;
    case "home_or_draw":
    case "away_or_draw": {
      const directional =
        perspective === "home_or_draw"
          ? (predictionHome ?? clamp(implied + sideGap * 0.05, 0.15, 0.8))
          : (predictionAway ?? clamp(implied - sideGap * 0.05, 0.15, 0.8));
      const safeBase = directional + (predictionDraw ?? 0.24);
      modelProbability = modelProbability * 0.36 + clamp(safeBase, 0.32, 0.92) * 0.64;
      predictionPulse = "dupla chance compra proteção sem abrir mao do contexto";
      break;
    }
    case "over": {
      const line = candidate.lineValue ?? 2.5;
      const goalProjection =
        combinedGoalsProjection +
        ((combinedShotsOnTarget / 4) - 4.2) * 0.24 +
        (((xgCombined ?? combinedGoalsProjection) - 2.4) * 0.18) +
        (((venueGoalsAvg ?? combinedGoalsProjection) - 2.45) * 0.08);
      modelProbability = logistic((goalProjection - line) * 1.18);
      modelProbability = modelProbability * 0.74 + implied * 0.26;
      predictionPulse = "linha de gols apoiada em volume de alvo, ritmo e fragilidade defensiva";
      break;
    }
    case "under": {
      const line = candidate.lineValue ?? 2.5;
      const overProbability = logistic(
        ((combinedGoalsProjection + ((combinedShotsOnTarget / 4) - 4.2) * 0.2) - line) * 1.12,
      );
      modelProbability = 1 - overProbability;
      modelProbability = modelProbability * 0.74 + implied * 0.26;
      predictionPulse = "under sustentado por chance media controlada e menor explosao recente";
      break;
    }
    case "btts_yes":
      modelProbability =
        bttsProjection * 0.58 +
        clamp((combinedShotsOnTarget / 8.8) * 0.26, 0.08, 0.34) +
        implied * 0.16;
      predictionPulse = "ambos participam por volume para marcar e tambem conceder";
      break;
    case "btts_no":
      modelProbability =
        (1 - bttsProjection) * 0.58 +
        clamp(
          ((homeProfile.cleanSheetRate + awayProfile.cleanSheetRate) / 2 +
            (homeProfile.failedToScoreRate + awayProfile.failedToScoreRate) / 2) *
            0.34,
          0.08,
          0.4,
        ) +
        implied * 0.14;
      predictionPulse = "BTTS nao ganha suporte de clean sheets e falhas recentes para marcar";
      break;
    default:
      if (candidate.marketCategory === "corners") {
        const line = candidate.lineValue ?? 9.5;
        const overProbability = logistic(
          ((combinedCornersProjection + (((venueCornersAvg ?? combinedCornersProjection) - 9.6) * 0.18)) - line) * 0.78,
        );
        modelProbability = selectionDirection(candidate.selection) === "under" ? 1 - overProbability : overProbability;
        modelProbability = modelProbability * 0.76 + implied * 0.24;
        predictionPulse = "escanteios usam volume recente de corners for/against e territorio";
      } else if (candidate.marketCategory === "cards") {
        const line = candidate.lineValue ?? 4.5;
        const overProbability = logistic(
          ((
            combinedCardsProjection +
            (((refereeYellowAvg ?? 4.5) - 4.5) * 0.38) +
            ((refereeRedAvg ?? 0.2) * 0.18) +
            (((refereeOver45Rate ?? 0.5) - 0.5) * 0.7)
          ) - line) * 0.72,
        );
        modelProbability = selectionDirection(candidate.selection) === "under" ? 1 - overProbability : overProbability;
        modelProbability = modelProbability * 0.76 + implied * 0.24;
        predictionPulse = "cartoes combinam disciplina recente, faltas e perfil de confronto";
      } else if (
        candidate.marketCategory === "players" ||
        candidate.marketCategory === "shots" ||
        candidate.marketCategory === "stats"
      ) {
        const referencedPlayer =
          findReferencedPlayer(candidate.selection, homeProfile.players) ??
          findReferencedPlayer(candidate.selection, awayProfile.players);
        if (referencedPlayer) {
          const playerSignal = clamp(
            per90(
              referencedPlayer.shotsOnTarget + referencedPlayer.goals + referencedPlayer.assists * 0.8,
              referencedPlayer.minutes,
            ) / 2.8,
            0.08,
            0.76,
          );
          modelProbability = implied * 0.42 + playerSignal * 0.58;
          predictionPulse =
            candidate.marketCategory === "shots"
              ? `${referencedPlayer.name} entrou no modelo por minutos e volume de finalizacao individual`
              : candidate.marketCategory === "stats"
                ? `${referencedPlayer.name} entrou no modelo como prop estatística individual monitorada`
              : `${referencedPlayer.name} entrou no modelo por minutos, volume individual e papel no time`;
        } else {
          modelProbability += getMarketStabilityBias(candidate.marketCategory) * 0.16;
          predictionPulse =
            candidate.marketCategory === "shots"
              ? "mercado de chutes sem atleta claramente identificado no feed"
              : candidate.marketCategory === "stats"
                ? "mercado estatístico mantido perto da linha implicita por falta de assinatura mais forte"
              : "player prop sem atleta claramente identificado no feed";
        }
      } else {
        modelProbability += getMarketStabilityBias(candidate.marketCategory) * 0.16;
        predictionPulse = "mercado mantido perto da linha implicita por falta de assinatura mais forte";
      }
  }

  if (weatherRainRisk || weatherWindRisk) {
    if (perspective === "over" || perspective === "btts_yes") {
      modelProbability -= weatherWindRisk ? 0.018 : 0.012;
    } else if (perspective === "under" || perspective === "btts_no") {
      modelProbability += weatherWindRisk ? 0.018 : 0.012;
    }
  }

  if (weatherHeatRisk) {
    if (perspective === "over" || perspective === "btts_yes") {
      modelProbability -= 0.01;
    } else if (perspective === "under" || perspective === "btts_no") {
      modelProbability += 0.01;
    }
  }

  if (lineMovement?.trend === "steam") {
    modelProbability += 0.01;
    predictionPulse = `${predictionPulse}; o mercado vem encurtando a selecao.`;
  } else if (lineMovement?.trend === "drift") {
    modelProbability -= 0.008;
    predictionPulse = `${predictionPulse}; houve drift recente contra a selecao.`;
  }

  if (!lineupsReady) modelProbability -= 0.018;
  if (homeProfile.structuralAbsences.length + awayProfile.structuralAbsences.length >= 2) modelProbability -= 0.008;
  if (
    (candidate.marketCategory === "players" ||
      candidate.marketCategory === "shots" ||
      candidate.marketCategory === "stats") &&
    !lineupsReady
  ) {
    modelProbability -= 0.012;
  }

  const calibrationNotes: string[] = [];
  const calibrationAdjustments = [
    calibration?.overall ?? null,
    calibration?.byMarket[candidate.marketCategory] ?? null,
    calibration?.byLeague[String(candidate.leagueId)] ?? null,
  ].filter((bucket): bucket is CalibrationBucket => Boolean(bucket));
  const probabilityCalibration = calibrationAdjustments.reduce(
    (total, bucket) => total + bucket.probabilityDelta,
    0,
  );
  const confidenceCalibration = calibrationAdjustments.reduce(
    (total, bucket) => total + bucket.confidenceDelta,
    0,
  );
  const riskCalibration = calibrationAdjustments.reduce(
    (total, bucket) => total + bucket.riskDelta,
    0,
  );

  if (calibrationAdjustments.length) {
    const strongest = calibrationAdjustments.reduce((best, current) =>
      Math.abs(current.confidenceDelta) > Math.abs(best.confidenceDelta) ? current : best,
    );
    if (Math.abs(strongest.confidenceDelta) >= 0.5) {
      calibrationNotes.push(
        strongest.confidenceDelta > 0
          ? `A calibracao historica desse recorte reforca a confiança com base em ${strongest.sampleSize} amostras.`
          : `A calibracao historica desse recorte pede mais cautela com base em ${strongest.sampleSize} amostras.`,
      );
    }
  }

  modelProbability = clamp(modelProbability, 0.08, 0.92);
  modelProbability = clamp(modelProbability + probabilityCalibration, 0.08, 0.92);
  const fairOdd = 1 / modelProbability;
  const edge = modelProbability - implied;
  const expectedValue = candidate.bestOdd * modelProbability - 1;
  const riskScore = clamp(
    1 -
      quality +
      (lineupsReady ? 0 : 0.1) +
      (candidate.marketCategory === "players" ? 0.1 : 0) +
      (candidate.marketCategory === "shots" ? 0.07 : 0) +
      (candidate.marketCategory === "stats" ? 0.08 : 0) +
      (candidate.marketCategory === "cards" ? 0.06 : 0) +
      weatherFlags.caution.length * 0.025 +
      (homeProfile.structuralAbsences.length + awayProfile.structuralAbsences.length) * 0.02 +
      riskCalibration,
    0.08,
    0.84,
  );
  const confidence = clamp(
    modelProbability * 100 +
      edge * 105 +
      quality * 16 -
      riskScore * 21 +
      candidate.sportsbookCount * 1.2 +
      confidenceCalibration,
    18,
    97,
  );

  const sections = [
    toneSection("context", "Contexto do jogo", "neutral", [
      `${candidate.leagueName} • ${candidate.leagueCountry} • ${competitiveContext.competitionType}.`,
      competitiveContext.tieStage !== "nao-aplicavel" ? `Fase do confronto: ${competitiveContext.tieStage}.` : null,
      competitiveContext.aggregateNote,
      competitiveContext.importanceNote,
      lineMovement?.signal,
    ]),
    toneSection("availability", "Escalacao e disponibilidade", homeProfile.structuralAbsences.length + awayProfile.structuralAbsences.length ? "caution" : "support", [
      homeLineup ? `${candidate.homeTeam} confirmado em ${homeLineup.formation ?? "formacao aberta"}.` : `${candidate.homeTeam} ainda depende de confirmacao final de escalação.`,
      awayLineup ? `${candidate.awayTeam} confirmado em ${awayLineup.formation ?? "formacao aberta"}.` : `${candidate.awayTeam} ainda depende de confirmacao final de escalação.`,
      homeProfile.structuralAbsences.length ? `${candidate.homeTeam}: ${homeProfile.structuralAbsences.join(", ")}.` : null,
      awayProfile.structuralAbsences.length ? `${candidate.awayTeam}: ${awayProfile.structuralAbsences.join(", ")}.` : null,
      ...homeProfile.likelySuspensions,
      ...awayProfile.likelySuspensions,
      homeProfile.benchNote,
      awayProfile.benchNote,
    ]),
    toneSection("form", "Momento recente", "support", [
      `${candidate.homeTeam}: ${homeProfile.recent5.pointsPerMatch.toFixed(2)} pts/j nos ultimos 5 e ${homeProfile.recent10.pointsPerMatch.toFixed(2)} nos ultimos 10.`,
      `${candidate.awayTeam}: ${awayProfile.recent5.pointsPerMatch.toFixed(2)} pts/j nos ultimos 5 e ${awayProfile.recent10.pointsPerMatch.toFixed(2)} nos ultimos 10.`,
      `${candidate.homeTeam} em casa: ${homeProfile.sidePointsPerMatch.toFixed(2)} pts/j. ${candidate.awayTeam} fora: ${awayProfile.sidePointsPerMatch.toFixed(2)} pts/j.`,
    ]),
    toneSection("offense", "Producao ofensiva", "support", [
      `${candidate.homeTeam}: ${homeProfile.recent10.goalsForAvg.toFixed(2)} gols, ${homeProfile.recent10.shotsAvg.toFixed(1)} chutes e ${homeProfile.recent10.shotsOnTargetAvg.toFixed(1)} no alvo.`,
      `${candidate.awayTeam}: ${awayProfile.recent10.goalsForAvg.toFixed(2)} gols, ${awayProfile.recent10.shotsAvg.toFixed(1)} chutes e ${awayProfile.recent10.shotsOnTargetAvg.toFixed(1)} no alvo.`,
      homeProfile.topFinisher ? `${candidate.homeTeam} finaliza muito com ${homeProfile.topFinisher.name}.` : null,
      awayProfile.topFinisher ? `${candidate.awayTeam} finaliza muito com ${awayProfile.topFinisher.name}.` : null,
    ]),
    toneSection("defense", "Producao defensiva", "neutral", [
      `${candidate.homeTeam}: ${homeProfile.recent10.goalsAgainstAvg.toFixed(2)} gols sofridos e ${homeProfile.recent10.shotsOnTargetFacedAvg.toFixed(1)} cedidos no alvo.`,
      `${candidate.awayTeam}: ${awayProfile.recent10.goalsAgainstAvg.toFixed(2)} gols sofridos e ${awayProfile.recent10.shotsOnTargetFacedAvg.toFixed(1)} cedidos no alvo.`,
      `${candidate.homeTeam} clean sheets: ${(homeProfile.cleanSheetRate * 100).toFixed(0)}%. ${candidate.awayTeam}: ${(awayProfile.cleanSheetRate * 100).toFixed(0)}%.`,
    ]),
    toneSection("advanced", "Metricas avancadas", advancedFeedAvailable ? "support" : "neutral", [
      xgCombined !== null ? `xG/xGA combinado projetado em ${xgCombined.toFixed(2)} (${xgContext.source === "feed" ? "feed direto" : xgContext.source === "mixed" ? "feed + estimacao" : "estimacao por volume"}).` : "xG/xGA nao vieram de forma consistente; o modelo usou volume de chutes, alvo, area e posse como proxy.",
      homeProfile.recent10.xgAvg !== null && awayProfile.recent10.xgAvg !== null
        ? `${candidate.homeTeam} cria ${homeProfile.recent10.xgAvg.toFixed(2)} xG/j; ${candidate.awayTeam} cria ${awayProfile.recent10.xgAvg.toFixed(2)} xG/j no recorte recente.`
        : null,
      advancedFeedAvailable ? `${candidate.homeTeam} e ${candidate.awayTeam} tiveram boa cobertura de stats de processo nos jogos recentes.` : "PPDA/xT nao vieram no feed atual; a leitura de estilo usa proxies de territorio e circulacao.",
      ...calibrationNotes,
    ]),
    toneSection("style", "Estilo de jogo", "neutral", [
      homeProfile.styleTags.length ? `${candidate.homeTeam}: ${homeProfile.styleTags.join(", ")}.` : null,
      awayProfile.styleTags.length ? `${candidate.awayTeam}: ${awayProfile.styleTags.join(", ")}.` : null,
      homeProfile.dominantFormations.length ? `${candidate.homeTeam} se apoia em ${homeProfile.dominantFormations.join(" / ")}.` : null,
      awayProfile.dominantFormations.length ? `${candidate.awayTeam} se apoia em ${awayProfile.dominantFormations.join(" / ")}.` : null,
    ]),
    toneSection("matchup", "Encaixe tatico", edge >= 0.03 ? "support" : "neutral", [
      `${candidate.homeTeam} produz ${homeProfile.recent10.shotsOnTargetAvg.toFixed(1)} no alvo/j; ${candidate.awayTeam} cede ${awayProfile.recent10.shotsOnTargetFacedAvg.toFixed(1)}.`,
      `${candidate.awayTeam} produz ${awayProfile.recent10.shotsOnTargetAvg.toFixed(1)} no alvo/j; ${candidate.homeTeam} cede ${homeProfile.recent10.shotsOnTargetFacedAvg.toFixed(1)}.`,
      attackMatchupGap > 0.5 ? "O matchup pende mais para o mandante em volume de alvo." : attackMatchupGap < -0.5 ? "O matchup pende mais para o visitante em volume de alvo." : "O confronto parece equilibrado em processo ofensivo/defensivo.",
    ]),
    toneSection("set_pieces", "Bola parada", candidate.marketCategory === "corners" ? "support" : "neutral", [
      `${candidate.homeTeam}: ${homeProfile.recent10.cornersForAvg.toFixed(1)} corners a favor e ${homeProfile.recent10.cornersAgainstAvg.toFixed(1)} contra.`,
      `${candidate.awayTeam}: ${awayProfile.recent10.cornersForAvg.toFixed(1)} corners a favor e ${awayProfile.recent10.cornersAgainstAvg.toFixed(1)} contra.`,
      homeProfile.topSetPiece ? `${candidate.homeTeam} tende a concentrar bola parada em ${homeProfile.topSetPiece.name}.` : null,
      awayProfile.topSetPiece ? `${candidate.awayTeam} tende a concentrar bola parada em ${awayProfile.topSetPiece.name}.` : null,
      venueCornersAvg !== null && venueCornersAvg !== undefined
        ? `O estadio vem em media de ${venueCornersAvg.toFixed(1)} corners nos ultimos jogos.`
        : null,
    ]),
    toneSection("players", "Jogadores-chave", "neutral", [
      homeProfile.topCreator ? `${candidate.homeTeam} cria muito com ${homeProfile.topCreator.name}.` : null,
      awayProfile.topCreator ? `${candidate.awayTeam} cria muito com ${awayProfile.topCreator.name}.` : null,
      ...homeProfile.dependencyNotes,
      ...awayProfile.dependencyNotes,
    ]),
    toneSection("calendar", "Calendario e desgaste", "caution", [
      homeProfile.restDays !== null ? `${candidate.homeTeam} chega com ${homeProfile.restDays.toFixed(1)} dias de descanso.` : null,
      awayProfile.restDays !== null ? `${candidate.awayTeam} chega com ${awayProfile.restDays.toFixed(1)} dias de descanso.` : null,
      homeProfile.gamesLast14 >= 4 ? `${candidate.homeTeam} empilha ${homeProfile.gamesLast14} jogos nos ultimos 14 dias.` : null,
      awayProfile.gamesLast14 >= 4 ? `${candidate.awayTeam} empilha ${awayProfile.gamesLast14} jogos nos ultimos 14 dias.` : null,
      homeProfile.travelNote,
      awayProfile.travelNote,
      competitiveContext.nextGameRiskNote,
    ]),
    toneSection("environment", "Casa, fora e ambiente", "neutral", [
      `${candidate.homeTeam} em casa faz ${homeProfile.sideGoalsForAvg.toFixed(2)} gols/j e sofre ${homeProfile.sideGoalsAgainstAvg.toFixed(2)}.`,
      `${candidate.awayTeam} fora faz ${awayProfile.sideGoalsForAvg.toFixed(2)} gols/j e sofre ${awayProfile.sideGoalsAgainstAvg.toFixed(2)}.`,
      candidate.venueName ? `Jogo em ${candidate.venueName}${candidate.venueCity ? `, ${candidate.venueCity}` : ""}.` : null,
      candidate.context.venueProfile?.goalsAvg !== null && candidate.context.venueProfile?.goalsAvg !== undefined
        ? `O estadio vem em media de ${candidate.context.venueProfile.goalsAvg.toFixed(2)} gols nos ultimos ${candidate.context.venueProfile.samples} jogos monitorados.`
        : null,
    ]),
    toneSection("weather", "Clima previsto", weatherFlags.caution.length ? "caution" : "neutral", [
      weather
        ? `${weather.locationLabel}: ${weather.temperatureC !== null ? `${weather.temperatureC.toFixed(0)}°C` : "temperatura n/d"}${weather.apparentTemperatureC !== null ? `, sensacao ${weather.apparentTemperatureC.toFixed(0)}°C` : ""}.`
        : "Sem clima confirmado para a venue; leitura segue sem esse filtro final.",
      weather
        ? `Chuva ${weather.precipitationProbability !== null ? `${weather.precipitationProbability.toFixed(0)}%` : "n/d"}${weather.precipitationMm !== null ? ` e ${weather.precipitationMm.toFixed(1)} mm` : ""}; vento ${weather.windSpeedKmh !== null ? `${weather.windSpeedKmh.toFixed(0)} km/h` : "n/d"}${weather.windGustsKmh !== null ? `, rajadas ${weather.windGustsKmh.toFixed(0)} km/h` : ""}.`
        : null,
      ...weatherFlags.caution,
      ...weatherFlags.support,
    ]),
    toneSection("discipline", "Disciplina e noticia", "caution", [
      `${candidate.homeTeam} soma ${homeProfile.yellowCardsTotal} amarelos e ${homeProfile.redCardsTotal} vermelhos na temporada.`,
      `${candidate.awayTeam} soma ${awayProfile.yellowCardsTotal} amarelos e ${awayProfile.redCardsTotal} vermelhos na temporada.`,
      candidate.referee ? `Arbitro previsto: ${candidate.referee}.` : null,
      refereeYellowAvg !== null && refereeYellowAvg !== undefined
        ? `Recorte recente do arbitro aponta media de ${refereeYellowAvg.toFixed(1)} amarelos por jogo.`
        : null,
      refereeOver45Rate !== null && refereeOver45Rate !== undefined
        ? `${((refereeOver45Rate ?? 0) * 100).toFixed(0)}% dos jogos recentes desse arbitro bateram 4.5+ cartoes.`
        : null,
      candidate.context.prediction?.predictions?.advice ? `Advice da API-Football: ${candidate.context.prediction.predictions.advice}` : null,
    ]),
    toneSection("news", "Confirmacao oficial", "caution", [
      homeInjuries.length || awayInjuries.length
        ? `Feed oficial trouxe ${homeInjuries.length + awayInjuries.length} apontamentos de indisponibilidade para esta fixture.`
        : "Sem apontamento oficial de indisponibilidade no feed desta fixture ate aqui.",
      !lineupsReady ? "Sem escalação oficial completa, a leitura final ainda carrega cautela de ultima hora." : null,
      homeProfile.likelySuspensions.length || awayProfile.likelySuspensions.length
        ? "Possiveis suspensoes foram inferidas a partir de expulsao recente e ainda pedem confirmacao oficial final."
        : null,
    ]),
  ].filter((section): section is AnalysisSection => Boolean(section));

  const reasons = sections.filter((section) => section.tone === "support").flatMap((section) => section.bullets).slice(0, 4);
  const cautions = sections.filter((section) => section.tone !== "support").flatMap((section) => section.bullets).slice(0, 3);

  let aiVerdict: AnalysisPick["aiVerdict"] = "lean_yes";
  if (edge >= 0.06 && confidence >= 74) aiVerdict = "strong_yes";
  else if (edge >= 0.03 && confidence >= 64) aiVerdict = "yes";
  else if (edge < 0.005 || expectedValue < 0) aiVerdict = "pass";

  let aiConfidenceLabel: AnalysisPick["aiConfidenceLabel"] = "guarded";
  if (confidence >= 80) aiConfidenceLabel = "elite";
  else if (confidence >= 68) aiConfidenceLabel = "high";
  else if (confidence >= 56) aiConfidenceLabel = "medium";

  return {
    candidateId: candidate.candidateId,
    fixtureId: candidate.fixtureId,
    fixtureLabel: `${candidate.homeTeam} vs ${candidate.awayTeam}`,
    fixtureDate: candidate.fixtureDate,
    leagueId: candidate.leagueId,
    leagueName: candidate.leagueName,
    leagueCountry: candidate.leagueCountry,
    homeTeam: candidate.homeTeam,
    awayTeam: candidate.awayTeam,
    marketId: candidate.marketId,
    marketName: presentation.marketName,
    marketCategory: candidate.marketCategory,
    selection: presentation.selection,
    selectionKey: candidate.selectionKey,
    rawMarketName: candidate.rawMarketName,
    rawSelectionValue: candidate.rawSelectionValue,
    rawHandicap: candidate.rawHandicap,
    bestOdd: candidate.bestOdd,
    consensusOdd: candidate.consensusOdd,
    sportsbookCount: candidate.sportsbookCount,
    bookmaker: candidate.bookmaker,
    bookmakerPool: candidate.bookmakerPool,
    impliedProbability: implied,
    modelProbability,
    fairOdd,
    edge,
    expectedValue,
    confidence,
    riskScore,
    dataQualityScore: quality,
    xgContext,
    lineMovement,
    clv: {
      status: "pending",
      capturedOdd: candidate.bestOdd,
      closingOdd: null,
      delta: null,
      percentage: null,
    },
    tracking: {
      status: "open",
      settledAt: null,
      resultLabel: null,
      profitUnits: null,
    },
    refereeStats,
    lineupStatus:
      homeProfile.lineupStatus === "confirmed" || awayProfile.lineupStatus === "confirmed"
        ? "confirmed"
        : homeProfile.lineupStatus === "projected" || awayProfile.lineupStatus === "projected"
          ? "projected"
          : "unknown",
    predictionPulse,
    summary: `${presentation.selection} em ${formatOdd(candidate.bestOdd)} com odd justa em ${formatOdd(fairOdd)}. O modelo cruzou tabela, forma 5/10, producao, elenco, calendario, clima e contexto antes da revisao da IA.`,
    reasons,
    cautions,
    analysisSections: sections,
    newsNote: null,
    aiVerdict,
    aiConfidenceLabel,
  };
}

function createFixtureContextLoader(filters: AnalysisFilters) {
  const cache = new Map<string, Promise<FixtureContext>>();
  const standingsCache = new Map<string, Promise<ApiFootballStandingEntry[]>>();
  const teamCache = new Map<string, Promise<TeamContext>>();
  const leagueDetailedCache = new Map<string, Promise<ApiFootballFixture[]>>();
  const venueCache = new Map<string, Promise<VenueProfile | null>>();
  const weatherCache = new Map<string, Promise<WeatherSnapshot | null>>();

  function getStandingsForLeague(leagueId: number, season: number) {
    const cacheKey = `${leagueId}:${season}`;
    const cached = standingsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = fetchStandings(leagueId, season).catch(() => []);
    standingsCache.set(cacheKey, request);
    return request;
  }

  function getTeamContext(
    teamId: number,
    leagueId: number,
    season: number,
    scanDate: string,
  ) {
    const cacheKey = `${teamId}:${leagueId}:${season}:${scanDate}`;
    const cached = teamCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = (async () => {
      const standings = await getStandingsForLeague(leagueId, season);

      if (env.API_FOOTBALL_FREE_PLAN_MODE) {
        const recentFixtures = await fetchRecentFixtures(teamId, 5).catch(() => []);
        return {
          recentFixtures,
          recentDetailedFixtures: recentFixtures,
          seasonStats: null,
          standing: standings.find((entry) => entry.team?.id === teamId) ?? null,
          players: [],
          nextFixtures: [],
        } satisfies TeamContext;
      }

      const [seasonStats, players, recentFixtures, nextFixtures] = await Promise.all([
        fetchTeamStatistics(leagueId, season, teamId, scanDate).catch(() => null),
        fetchTeamPlayers(teamId, season, leagueId, 3).catch(() => []),
        fetchRecentFixtures(teamId, 10).catch(() => []),
        fetchNextFixtures(teamId, 3).catch(() => []),
      ]);

      const recentDetailedFixtures = recentFixtures.length
        ? await fetchFixturesByIds(recentFixtures.map((fixture) => fixture.fixture.id)).catch(() => recentFixtures)
        : [];

      return {
        recentFixtures,
        recentDetailedFixtures,
        seasonStats,
        standing: standings.find((entry) => entry.team?.id === teamId) ?? null,
        players,
        nextFixtures,
      } satisfies TeamContext;
    })();

    teamCache.set(cacheKey, request);
    return request;
  }

  function getLeagueDetailedFixtures(leagueId: number, season: number) {
    const cacheKey = `${leagueId}:${season}`;
    const cached = leagueDetailedCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = (async () => {
      const recentLeagueFixtures = await fetchLeagueRecentFixtures(leagueId, season, 24, "FT").catch(() => []);
      if (!recentLeagueFixtures.length) {
        return [] as ApiFootballFixture[];
      }

      return fetchFixturesByIds(recentLeagueFixtures.map((fixture) => fixture.fixture.id)).catch(
        () => recentLeagueFixtures,
      );
    })();

    leagueDetailedCache.set(cacheKey, request);
    return request;
  }

  function getVenueProfile(venueId: number | null | undefined) {
    const normalizedVenueId = venueId ?? null;
    const cacheKey = String(normalizedVenueId ?? "none");
    const cached = venueCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = (async () => {
      if (!normalizedVenueId) {
        return null;
      }

      const recentVenueFixtures = await fetchFixturesByVenue(normalizedVenueId, 6).catch(() => []);
      if (!recentVenueFixtures.length) {
        return null;
      }

      const detailed = await fetchFixturesByIds(
        recentVenueFixtures.map((fixture) => fixture.fixture.id),
      ).catch(() => recentVenueFixtures);

      return buildVenueProfile(detailed, normalizedVenueId);
    })();

    venueCache.set(cacheKey, request);
    return request;
  }

  function getWeatherSnapshotForFixture(candidate: RawCandidate) {
    const cacheKey = [
      candidate.venueId ?? "none",
      candidate.venueCity ?? "no-city",
      candidate.venueName ?? "no-venue",
      candidate.leagueCountry,
      candidate.fixtureDate,
    ].join(":");
    const cached = weatherCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = fetchWeatherSnapshot({
      kickoffIso: candidate.fixtureDate,
      city: candidate.venueCity,
      venueName: candidate.venueName,
      country: candidate.leagueCountry,
    }).catch(() => null);

    weatherCache.set(cacheKey, request);
    return request;
  }

  return async function getFixtureContext(candidate: RawCandidate) {
    const cacheKey = `${candidate.fixtureId}:${candidate.homeTeamId}:${candidate.awayTeamId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = (async () => {
      if (env.API_FOOTBALL_FREE_PLAN_MODE) {
        const [prediction, weather] = await Promise.all([
          fetchPredictions(candidate.fixtureId).catch(() => null),
          getWeatherSnapshotForFixture(candidate),
        ]);
        const standings = await getStandingsForLeague(candidate.leagueId, candidate.season);
        const [home, away] = await Promise.all([
          getTeamContext(candidate.homeTeamId, candidate.leagueId, candidate.season, filters.scanDate),
          getTeamContext(candidate.awayTeamId, candidate.leagueId, candidate.season, filters.scanDate),
        ]);
        return {
          prediction,
          lineups: [],
          injuries: [],
          h2h: [],
          standings,
          home,
          away,
          venueProfile: null,
          refereeProfile: null,
          competitiveContext: {
            competitionType: "copa",
            tieStage: "nao-aplicavel",
            aggregateNote: null,
            importanceNote: null,
            nextGameRiskNote: null,
            derbyNote: null,
          },
          weather,
        } satisfies FixtureContext;
      }

      const [prediction, lineups, injuries, h2h, standings, home, away, leagueDetailed, venueProfile, weather] =
        await Promise.all([
          fetchPredictions(candidate.fixtureId).catch(() => null),
          fetchLineups(candidate.fixtureId).catch(() => []),
          fetchInjuries(candidate.fixtureId).catch(() => []),
          fetchHeadToHead(candidate.homeTeamId, candidate.awayTeamId).catch(() => []),
          getStandingsForLeague(candidate.leagueId, candidate.season),
          getTeamContext(candidate.homeTeamId, candidate.leagueId, candidate.season, filters.scanDate),
          getTeamContext(candidate.awayTeamId, candidate.leagueId, candidate.season, filters.scanDate),
          getLeagueDetailedFixtures(candidate.leagueId, candidate.season),
          getVenueProfile(candidate.venueId),
          getWeatherSnapshotForFixture(candidate),
        ]);

      const refereeProfile = buildRefereeProfile(candidate.referee, leagueDetailed);

      return {
        prediction,
        lineups,
        injuries,
        h2h,
        standings,
        home,
        away,
        venueProfile,
        refereeProfile,
        competitiveContext: {
          competitionType: "copa",
          tieStage: "nao-aplicavel",
          aggregateNote: null,
          importanceNote: null,
          nextGameRiskNote: null,
          derbyNote: null,
        },
        weather,
      } satisfies FixtureContext;
    })();

    cache.set(cacheKey, request);
    return request;
  };
}

async function enrichCandidate(
  candidate: RawCandidate,
  getFixtureContext: (candidate: RawCandidate) => Promise<FixtureContext>,
) {
  return {
    ...candidate,
    context: await getFixtureContext(candidate),
  } satisfies EnrichedCandidate;
}

function getAccumulatorMaxLegs(targetAccumulatorOdd: number) {
  return targetAccumulatorOdd >= 9
    ? 5
    : targetAccumulatorOdd >= 5
      ? 4
      : targetAccumulatorOdd >= 3
        ? 3
        : 2;
}

function buildAccumulator(picks: AnalysisPick[], targetAccumulatorOdd: number, includeSameGame: boolean) {
  type AccumulatorCandidate = {
    picks: AnalysisPick[];
    combinedOdd: number;
    score: number;
  };

  const eligible = picks.filter((pick) => pick.aiVerdict !== "pass").slice(0, 18);
  if (!eligible.length) return null;

  const maxLegs = getAccumulatorMaxLegs(targetAccumulatorOdd);

  let best: AccumulatorCandidate | null = null;

  function evaluate(selected: AnalysisPick[], combinedOdd: number) {
    if (!selected.length) {
      return;
    }

    const averageConfidence =
      selected.reduce((total, pick) => total + pick.confidence, 0) / selected.length;
    const averageEdge = selected.reduce((total, pick) => total + pick.edge, 0) / selected.length;
    const distanceRatio = Math.abs(combinedOdd - targetAccumulatorOdd) / Math.max(targetAccumulatorOdd, 1);
    const targetHitBonus = combinedOdd >= targetAccumulatorOdd ? 0.18 : 0;
    const underTargetPenalty = combinedOdd < targetAccumulatorOdd ? distanceRatio * 0.24 : 0;
    const overshootPenalty = combinedOdd > targetAccumulatorOdd ? distanceRatio * 0.12 : 0;
    const score =
      1.25 -
      distanceRatio +
      targetHitBonus -
      underTargetPenalty -
      overshootPenalty +
      averageConfidence / 220 +
      averageEdge * 2.8 -
      Math.max(0, selected.length - 2) * 0.035;

    if (!best || score > best.score) {
      best = {
        picks: [...selected],
        combinedOdd,
        score,
      };
    }
  }

  function walk(
    startIndex: number,
    selected: AnalysisPick[],
    combinedOdd: number,
    usedFixtures: Set<number>,
  ) {
    evaluate(selected, combinedOdd);

    if (selected.length >= maxLegs || combinedOdd > targetAccumulatorOdd * 1.65) {
      return;
    }

    for (let index = startIndex; index < eligible.length; index += 1) {
      const pick = eligible[index];
      if (!includeSameGame && usedFixtures.has(pick.fixtureId)) {
        continue;
      }

      selected.push(pick);
      const nextCombinedOdd = combinedOdd * pick.bestOdd;
      const nextUsedFixtures = includeSameGame ? usedFixtures : new Set([...usedFixtures, pick.fixtureId]);
      walk(index + 1, selected, nextCombinedOdd, nextUsedFixtures);
      selected.pop();
    }
  }

  walk(0, [], 1, new Set<number>());

  if (!best) {
    return null;
  }

  const bestCandidate = best as AccumulatorCandidate;

  const averageConfidence =
    bestCandidate.picks.reduce((total, pick) => total + pick.confidence, 0) /
    bestCandidate.picks.length;
  const targetGap =
    Math.abs(bestCandidate.combinedOdd - targetAccumulatorOdd) / Math.max(targetAccumulatorOdd, 1);

  return {
    targetOdd: targetAccumulatorOdd,
    combinedOdd: bestCandidate.combinedOdd,
    confidence: clamp(
      averageConfidence - bestCandidate.picks.length * 4.5 - targetGap * 10,
      18,
      92,
    ),
    picks: bestCandidate.picks,
    rationale:
      bestCandidate.combinedOdd >= targetAccumulatorOdd && targetGap <= 0.18
        ? "Múltipla calibrada para bater ou encostar muito na odd alvo com a combinação mais saudável do radar."
        : bestCandidate.combinedOdd >= targetAccumulatorOdd
          ? "Múltipla passou a odd alvo com a combinação mais estável encontrada entre confiança, edge e correlação."
          : "Não houve combinação segura para bater a odd alvo; a carteira ficou abaixo para preservar qualidade.",
  };
}

function isFixtureUpcoming(statusShort: string | undefined) {
  return ["NS", "TBD", "PST"].includes(statusShort ?? "NS");
}

function isFixtureFinal(statusShort: string | undefined) {
  return ["FT", "AET", "PEN", "AWD", "WO"].includes(statusShort ?? "");
}

function parseLineFromText(text: string) {
  const match = text.match(/(-?\d+(?:[.,]\d+)?)/);
  return match ? parseDecimal(match[1]) : null;
}

function gradeBinary(
  won: boolean,
  label: string,
  odd: number,
): PickTrackingSnapshot {
  return {
    status: won ? "won" : "lost",
    settledAt: new Date().toISOString(),
    resultLabel: label,
    profitUnits: won ? odd - 1 : -1,
  };
}

function gradeUngraded(label: string): PickTrackingSnapshot {
  return {
    status: "ungraded",
    settledAt: new Date().toISOString(),
    resultLabel: label,
    profitUnits: null,
  };
}

function gradeTrackedPick(params: {
  pick: {
    marketCategory: AnalysisPick["marketCategory"];
    marketName: string;
    selection: string;
    homeTeam: string;
    awayTeam: string;
    bestOdd: number;
  };
  fixture: ApiFootballFixture;
  statistics: ApiFootballFixtureStatistics[];
}): PickTrackingSnapshot {
  const { pick, fixture, statistics } = params;
  const statusShort = fixture.fixture.status?.short;

  if (!isFixtureFinal(statusShort)) {
    return {
      status: "open",
      settledAt: null,
      resultLabel: null,
      profitUnits: null,
    };
  }

  const homeGoals = fixture.goals?.home ?? 0;
  const awayGoals = fixture.goals?.away ?? 0;
  const halftimeGoals = (fixture.score?.halftime?.home ?? 0) + (fixture.score?.halftime?.away ?? 0);
  const totalGoals = homeGoals + awayGoals;
  const detailedFixture = {
    ...fixture,
    statistics,
  } satisfies ApiFootballFixture;

  if (pick.marketName === "Resultado final") {
    if (pick.selection.includes(`${pick.homeTeam} vence`)) {
      return gradeBinary(homeGoals > awayGoals, "Resultado final liquidado.", pick.bestOdd);
    }

    if (pick.selection.includes(`${pick.awayTeam} vence`)) {
      return gradeBinary(awayGoals > homeGoals, "Resultado final liquidado.", pick.bestOdd);
    }
  }

  if (pick.marketName === "Dupla chance") {
    if (pick.selection.includes(pick.homeTeam)) {
      return gradeBinary(homeGoals >= awayGoals, "Dupla chance do mandante liquidada.", pick.bestOdd);
    }

    if (pick.selection.includes(pick.awayTeam)) {
      return gradeBinary(awayGoals >= homeGoals, "Dupla chance do visitante liquidada.", pick.bestOdd);
    }
  }

  if (pick.marketName === "Ambos marcam") {
    if (pick.selection.toLowerCase().includes("nao")) {
      return gradeBinary(!(homeGoals > 0 && awayGoals > 0), "Ambos marcam liquidado.", pick.bestOdd);
    }

    return gradeBinary(homeGoals > 0 && awayGoals > 0, "Ambos marcam liquidado.", pick.bestOdd);
  }

  if (
    pick.marketName === "Total de gols" ||
    pick.marketName === "Total de gols do mandante" ||
    pick.marketName === "Total de gols do visitante" ||
    pick.marketName === "1º tempo"
  ) {
    const line = parseLineFromText(pick.selection);
    if (line === null) {
      return gradeUngraded("Linha de gols nao pode ser lida com seguranca.");
    }

    const lowerSelection = pick.selection.toLowerCase();
    const targetValue =
      pick.marketName === "1º tempo"
        ? halftimeGoals
        : pick.marketName === "Total de gols do mandante"
          ? homeGoals
          : pick.marketName === "Total de gols do visitante"
            ? awayGoals
            : totalGoals;

    return gradeBinary(
      lowerSelection.includes("mais de") ? targetValue > line : targetValue < line,
      `${pick.marketName} liquidado.`,
      pick.bestOdd,
    );
  }

  if (pick.marketName === "Total de escanteios") {
    const line = parseLineFromText(pick.selection);
    const totalCorners = getFixtureTotalStat(detailedFixture, "corner kicks");
    if (line === null || totalCorners === null) {
      return gradeUngraded("Escanteios sem estatistica final confiavel.");
    }

    return gradeBinary(
      pick.selection.toLowerCase().includes("mais de") ? totalCorners > line : totalCorners < line,
      "Mercado de escanteios liquidado.",
      pick.bestOdd,
    );
  }

  if (pick.marketName === "Total de cartoes") {
    const line = parseLineFromText(pick.selection);
    const totalYellow = getFixtureTotalStat(detailedFixture, "yellow cards") ?? 0;
    const totalRed = getFixtureTotalStat(detailedFixture, "red cards") ?? 0;
    const totalCards = totalYellow + totalRed;
    if (line === null) {
      return gradeUngraded("Linha de cartoes nao pode ser lida com seguranca.");
    }

    return gradeBinary(
      pick.selection.toLowerCase().includes("mais de") ? totalCards > line : totalCards < line,
      "Mercado de cartoes liquidado pelo total simples de amarelos + vermelhos.",
      pick.bestOdd,
    );
  }

  if (pick.marketName === "Handicap") {
    return gradeUngraded("Handicap mantido fora da liquidacao automatica nesta versao.");
  }

  if (pick.marketCategory === "players") {
    return gradeUngraded("Props de jogador ainda nao entram na liquidacao automatica.");
  }

  return gradeUngraded("Mercado ainda sem regra de liquidacao automatica.");
}

async function refreshHistoricalPickTracking() {
  const trackedPicks = await getTrackedPicksForRefresh();
  const pending = trackedPicks.filter(
    (pick) => pick.tracking.status === "open" || !pick.clv || pick.clv.status === "pending",
  );

  if (!pending.length) {
    return;
  }

  const fixtures = await fetchFixturesByIds(
    Array.from(new Set(pending.map((pick) => pick.fixtureId))),
  ).catch(() => []);
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.fixture.id, fixture]));
  const lineHistory = await getLineHistoryByCandidateIds(
    Array.from(new Set(pending.map((pick) => pick.candidateId))),
  );
  const statFixtureIds = Array.from(
    new Set(
      pending
        .filter((pick) =>
          ["corners", "cards"].includes(pick.marketCategory) ||
          ["Total de escanteios", "Total de cartoes"].includes(pick.marketName),
        )
        .map((pick) => pick.fixtureId),
    ),
  );
  const statisticsRows = await mapLimit(
    statFixtureIds,
    env.API_FOOTBALL_FREE_PLAN_MODE ? 1 : 4,
    async (fixtureId) => ({
      fixtureId,
      statistics: await fetchFixtureStatistics(fixtureId).catch(() => []),
    }),
  );
  const statisticsByFixtureId = new Map(
    statisticsRows.map((entry) => [entry.fixtureId, entry.statistics]),
  );

  for (const pick of pending) {
    const fixture = fixturesById.get(pick.fixtureId);
    if (!fixture) {
      continue;
    }

    const statusShort = fixture.fixture.status?.short;
    const history = lineHistory.get(pick.candidateId);
    let clv: ClvSnapshot | null = pick.clv ?? {
      status: "pending",
      capturedOdd: pick.bestOdd,
      closingOdd: null,
      delta: null,
      percentage: null,
    };

    if ((new Date(pick.fixtureDate).getTime() <= Date.now() || !isFixtureUpcoming(statusShort)) && clv.status === "pending") {
      if (!history || history.sampleCount < 2) {
        clv = {
          status: "unavailable",
          capturedOdd: pick.bestOdd,
          closingOdd: null,
          delta: null,
          percentage: null,
        };
      } else {
        const closingOdd = await getLatestClosingOdd(pick.candidateId, pick.fixtureDate);
        if (closingOdd !== null && Number.isFinite(closingOdd)) {
          const delta = pick.bestOdd - closingOdd;
          clv = {
            status: delta > 0.02 ? "positive" : delta < -0.02 ? "negative" : "flat",
            capturedOdd: pick.bestOdd,
            closingOdd,
            delta,
            percentage: closingOdd ? pick.bestOdd / closingOdd - 1 : null,
          };
        } else {
          clv = {
            status: "unavailable",
            capturedOdd: pick.bestOdd,
            closingOdd: null,
            delta: null,
            percentage: null,
          };
        }
      }
    }

    const tracking =
      pick.tracking.status === "open"
        ? gradeTrackedPick({
            pick,
            fixture,
            statistics: statisticsByFixtureId.get(pick.fixtureId) ?? [],
          })
        : pick.tracking;

    await updatePickLifecycle({
      id: pick.id,
      clv,
      tracking,
    });
  }
}

export async function runFootballAnalysis(
  rawFilters?: Partial<AnalysisFilters>,
  username = "default",
  options?: {
    onProgress?: (message: string) => Promise<void> | void;
  },
) {
  const aiEnabled = Boolean(env.OPENAI_API_KEY);
  const reportProgress = async (message: string) => {
    await options?.onProgress?.(message);
  };

  await reportProgress("Atualizando o histórico de picks e validando o radar.");
  await refreshHistoricalPickTracking().catch(() => null);
  const calibration = await rebuildCalibrationProfile(username).catch(() => getCalibrationProfile(username));

  const filters = normalizeFilters(rawFilters);
  const dates = getScanDates(filters.scanDate, filters.horizonHours);
  await reportProgress("Buscando fixtures e montando a janela elegível.");
  const fixturesByDate = await Promise.all(dates.map((date) => getCachedFixturesByDate(date)));
  const fixtures = fixturesByDate.flat();
  const remainingTodayFixtures = getRemainingFixturesToday(
    fixtures,
    filters.scanDate,
    filters.horizonHours,
  );
  const eligibleFixtures = filterEligibleFixtures(fixtures, filters);
  const baseFixtureBudget = Math.min(
    eligibleFixtures.length,
    env.API_FOOTBALL_FREE_PLAN_MODE
      ? Math.max(1, env.API_FOOTBALL_MAX_FIXTURES_PER_SCAN)
      : Math.max(env.API_FOOTBALL_MAX_FIXTURES_PER_SCAN, filters.pickCount * 3),
  );
  const fixtureBudget = baseFixtureBudget;
  const fixturesForOdds = selectFixturesForOdds(eligibleFixtures, filters, fixtureBudget);
  await reportProgress(`Consultando odds em ${fixturesForOdds.length} fixtures priorizadas.`);
  const oddsByFixture = await mapLimit(
    fixturesForOdds,
    env.API_FOOTBALL_FREE_PLAN_MODE ? 1 : env.API_FOOTBALL_ODDS_CONCURRENCY,
    async (fixture) => {
      const response = await getCachedOddsByFixture(
        fixture.fixture.id,
        env.API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER
          ? env.API_FOOTBALL_PRIMARY_BOOKMAKER_ID
          : undefined,
      ).catch(() => []);
      return response;
    },
  );
  const oddsEntries = oddsByFixture.flat();
  let rawCandidates = buildCandidates(eligibleFixtures, oddsEntries, filters, {
    minOdd: filters.minOdd,
    maxOdd: filters.maxOdd,
    seedTargetOdd: (filters.minOdd + filters.maxOdd) / 2,
  });
  const accumulatorMaxLegs = getAccumulatorMaxLegs(filters.targetAccumulatorOdd);
  const accumulatorSeedTarget = clamp(
    Math.pow(Math.max(filters.targetAccumulatorOdd, 1.1), 1 / accumulatorMaxLegs),
    1.15,
    5.5,
  );
  const accumulatorRawCandidates = buildCandidates(eligibleFixtures, oddsEntries, filters, {
    minOdd: 1.05,
    maxOdd: 20,
    seedTargetOdd: accumulatorSeedTarget,
  });
  const categoriesWithOdds = new Set(rawCandidates.map((candidate) => candidate.marketCategory));
  const combinedCandidates = Array.from(
    new Map(
      [...rawCandidates, ...accumulatorRawCandidates].map((candidate) => [
        candidate.candidateId,
        candidate,
      ]),
    ).values(),
  );
  const lineHistory = await getLineHistoryByCandidateIds(
    combinedCandidates.map((candidate) => candidate.candidateId),
  );
  rawCandidates = rawCandidates.map((candidate) => ({
    ...candidate,
    lineHistory: lineHistory.get(candidate.candidateId) ?? null,
  }));
  const accumulatorOnlyCandidates = accumulatorRawCandidates
    .filter(
      (candidate) =>
        !rawCandidates.some((currentCandidate) => currentCandidate.candidateId === candidate.candidateId),
    )
    .map((candidate) => ({
      ...candidate,
      lineHistory: lineHistory.get(candidate.candidateId) ?? null,
    }));
  const bookmakerScopeLabel = env.API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER
    ? env.API_FOOTBALL_PRIMARY_BOOKMAKER_NAME
    : "casas reguladas";
  const scanDateLabel = getScanDateLabel(filters.scanDate);
  const baseSeedVolume = env.API_FOOTBALL_FREE_PLAN_MODE
    ? Math.min(Math.max(filters.pickCount * 2, 12), 28)
    : Math.min(
        filters.pickCount * 4,
        Math.max(32, env.API_FOOTBALL_MAX_SEED_CANDIDATES),
      );
  const seedVolume = baseSeedVolume;
  const seededSingles = balanceItemsByCategory(
    rawCandidates,
    filters.marketCategories,
    seedVolume,
    (candidate) => candidate.candidateId,
  );
  const accumulatorSeedVolume = Math.min(
    Math.max(filters.pickCount * 3, accumulatorMaxLegs * 2),
    Math.max(24, env.API_FOOTBALL_MAX_SEED_CANDIDATES),
  );
  const seededAccumulator = balanceItemsByCategory(
    accumulatorOnlyCandidates,
    filters.marketCategories,
    accumulatorSeedVolume,
    (candidate) => candidate.candidateId,
  );
  const seeded = Array.from(
    new Map(
      [...seededSingles, ...seededAccumulator].map((candidate) => [candidate.candidateId, candidate]),
    ).values(),
  );
  const getFixtureContext = createFixtureContextLoader(filters);
  await reportProgress(`Aprofundando contexto em ${seeded.length} mercados candidatos.`);
  const enriched = await mapLimit(
    seeded,
    env.API_FOOTBALL_FREE_PLAN_MODE ? 1 : env.API_FOOTBALL_CONTEXT_CONCURRENCY,
    (candidate) => enrichCandidate(candidate, getFixtureContext),
  );
  const scoredPicks = enriched
    .map((candidate) => scoreCandidate(candidate, calibration))
    .filter((pick) => pick.expectedValue > -0.03)
    .sort((left, right) => right.confidence - left.confidence || right.edge - left.edge);
  let picks = scoredPicks.filter(
    (pick) => pick.bestOdd >= filters.minOdd && pick.bestOdd <= filters.maxOdd,
  );
  let accumulatorSourcePicks = scoredPicks.filter((pick) => pick.bestOdd >= 1.05 && pick.bestOdd <= 20);

  let executiveSummary = picks.length
    ? `O motor encontrou ${picks.length} picks acima da linha mínima de valor dentro da faixa de odd ${formatOdd(filters.minOdd)}-${formatOdd(filters.maxOdd)}.`
    : eligibleFixtures.length === 0
      ? filters.leagueIds.length
        ? remainingTodayFixtures.length
          ? `${scanDateLabel} ainda existem ${remainingTodayFixtures.length} jogos no total nesse recorte, mas nenhuma das ligas escolhidas tem partidas futuras nele.`
          : `${scanDateLabel} não há partidas futuras dentro da janela selecionada.`
        : `${scanDateLabel} não há partidas futuras dentro da janela selecionada.`
      : env.API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER && !oddsEntries.length
        ? `A API-Football não retornou mercados da ${bookmakerScopeLabel} para o recorte selecionado. Nesse caso, o radar não tem como montar picks mesmo com fixtures elegíveis.`
        : !rawCandidates.length
          ? `Existem ${eligibleFixtures.length} fixtures elegíveis em ${scanDateLabel.toLowerCase()}, mas nenhuma odd elegível entrou no filtro atual dentro da faixa ${formatOdd(filters.minOdd)}-${formatOdd(filters.maxOdd)}.`
          : `Foram encontrados mercados com odds, mas nenhum passou no corte final de valor dentro da faixa ${formatOdd(filters.minOdd)}-${formatOdd(filters.maxOdd)}.`;
  await reportProgress("Pontuando valor, risco e shortlist final.");
  const aiReviewSeed = aiEnabled
    ? balanceItemsByCategory(
        scoredPicks,
        filters.marketCategories,
        Math.min(Math.max(filters.pickCount * 4, 16), 28),
        (pick) => pick.candidateId,
      )
    : balanceItemsByCategory(
        scoredPicks,
        filters.marketCategories,
        Math.min(Math.max(filters.pickCount * 2, filters.pickCount), 20),
        (pick) => pick.candidateId,
      );
  const aiReview = await reviewPicksWithOpenAI(aiReviewSeed, filters).catch(() => null);

  if (aiReview) {
    executiveSummary = aiReview.executiveSummary;
    const reviewedPicks = aiReview.picks
      .map((pick) => ({
        ...pick,
        fairOdd: 1 / pick.modelProbability,
        edge: pick.modelProbability - pick.impliedProbability,
        expectedValue: pick.bestOdd * pick.modelProbability - 1,
      }))
      .sort((left, right) => {
        const verdictWeight = {
          strong_yes: 4,
          yes: 3,
          lean_yes: 2,
          pass: 1,
        } satisfies Record<AnalysisPick["aiVerdict"], number>;

        return (
          verdictWeight[right.aiVerdict] - verdictWeight[left.aiVerdict] ||
          right.confidence - left.confidence ||
          right.edge - left.edge
        );
      });

    const viableReviewedPicks = reviewedPicks.filter((pick) => pick.aiVerdict !== "pass").length
      ? reviewedPicks.filter((pick) => pick.aiVerdict !== "pass")
      : reviewedPicks;

    accumulatorSourcePicks = viableReviewedPicks.filter(
      (pick) => pick.bestOdd >= 1.05 && pick.bestOdd <= 20,
    );
    picks = balanceItemsByCategory(
      viableReviewedPicks.filter(
        (pick) => pick.bestOdd >= filters.minOdd && pick.bestOdd <= filters.maxOdd,
      ),
      filters.marketCategories,
      filters.pickCount,
      (pick) => pick.candidateId,
    );
  } else {
    accumulatorSourcePicks = scoredPicks.filter((pick) => pick.bestOdd >= 1.05 && pick.bestOdd <= 20);
    picks = balanceItemsByCategory(
      picks,
      filters.marketCategories,
      filters.pickCount,
      (pick) => pick.candidateId,
    );
  }

  const categoriesWithFinalPicks = new Set(picks.map((pick) => pick.marketCategory));
  const missingOddsCategories = filters.marketCategories.filter(
    (category) => !categoriesWithOdds.has(category),
  );
  const filteredOutCategories = filters.marketCategories.filter(
    (category) => categoriesWithOdds.has(category) && !categoriesWithFinalPicks.has(category),
  );

  if (missingOddsCategories.length || filteredOutCategories.length) {
    const notes: string[] = [];
    if (missingOddsCategories.length) {
      notes.push(
        `Sem odds elegiveis nesta faixa para: ${missingOddsCategories.join(", ")}.`,
      );
    }
    if (filteredOutCategories.length) {
      notes.push(
        `Com odds no feed, mas fora do corte final de valor/risco: ${filteredOutCategories.join(", ")}.`,
      );
    }
    executiveSummary = `${executiveSummary} ${notes.join(" ")}`.trim();
  }

  const accumulator = buildAccumulator(
    accumulatorSourcePicks,
    filters.targetAccumulatorOdd,
    filters.includeSameGame,
  );
  const webEnabled = aiEnabled && filters.useWebSearch && env.OPENAI_ENABLE_WEB_SEARCH;

  const run: AnalysisRun = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    filters,
    fixturesScanned: eligibleFixtures.length,
    candidatesScanned: rawCandidates.length,
    executiveSummary,
    systemNote: aiEnabled
      ? webEnabled
        ? "Análise concluída com motor estatístico + IA como árbitra principal, incluindo checagem web quando houve contexto recente relevante."
        : "Análise concluída com motor estatístico e IA como árbitra principal do ranking final."
      : "Análise concluída só com o motor estatístico local. Para ativar a revisão por IA, configure a OPENAI_API_KEY.",
    picks,
    accumulator,
  };

  if (env.API_FOOTBALL_FREE_PLAN_MODE) {
    run.systemNote = `${run.systemNote} xG/proxy, linha, CLV e tracking historico estao ativos. No plano grátis da API-Football, a varredura automática está limitada a ${fixturesForOdds.length} fixture${fixturesForOdds.length === 1 ? "" : "s"} por rodada para respeitar os limites da conta.`;
  } else {
    run.systemNote = `${run.systemNote} xG/proxy, linha, CLV e tracking historico estao ativos. Modo Pro ativo: scan profundo liberado para ${fixturesForOdds.length} fixtures nesta rodada, shortlist ampliada e contexto completo habilitado.`;
  }

  if (env.API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER) {
    run.systemNote = `${run.systemNote} Odds focadas exclusivamente em ${env.API_FOOTBALL_PRIMARY_BOOKMAKER_NAME}.`;
  } else {
    run.systemNote = `${run.systemNote} Odds comparadas somente entre casas reguladas mapeadas no feed brasileiro.`;
  }

  run.systemNote = `${run.systemNote} Worker dedicado, pré-coleta contínua de fixtures/odds e calibração histórica do modelo estão ativos.`;

  await reportProgress("Persistindo a rodada e fechando o scan.");
  await saveAnalysisRun(
    run,
    username,
    rawCandidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      fixtureId: candidate.fixtureId,
      marketName: candidate.marketName,
      selection: candidate.selection,
      bookmaker: candidate.bookmaker,
      bestOdd: candidate.bestOdd,
      consensusOdd: candidate.consensusOdd,
      sportsbookCount: candidate.sportsbookCount,
    })),
  );
  return run;
}
