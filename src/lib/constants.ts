import type {
  AnalysisFilters,
  MarketCategoryId,
  SupportedLeague,
  SupportedMarketCategory,
} from "@/lib/types";
import { getTodayDateInSaoPaulo, resolveAllowedScanDate } from "@/lib/utils";

type MarketRule = SupportedMarketCategory & {
  patterns: RegExp[];
  stabilityBias: number;
};

export const TOP_FOOTBALL_LEAGUES: SupportedLeague[] = [
  { id: 39, name: "Premier League", country: "Inglaterra", emphasis: "profundidade alta" },
  { id: 140, name: "La Liga", country: "Espanha", emphasis: "mercados amplos" },
  { id: 135, name: "Serie A", country: "Itália", emphasis: "linhas sólidas" },
  { id: 78, name: "Bundesliga", country: "Alemanha", emphasis: "ritmo ofensivo" },
  { id: 61, name: "Ligue 1", country: "França", emphasis: "boa cobertura" },
  { id: 71, name: "Brasileirão Série A", country: "Brasil", emphasis: "foco local" },
  { id: 2, name: "UEFA Champions League", country: "Europa", emphasis: "jogos premium" },
  { id: 13, name: "Libertadores", country: "América do Sul", emphasis: "contexto sul-americano" },
];

export const MARKET_RULES: MarketRule[] = [
  {
    id: "handicaps",
    label: "Handicaps",
    description: "Asian handicap, linhas de spread e proteções de lado.",
    accent: "from-violet-500 to-indigo-500",
    patterns: [/handicap/i, /asian/i, /spread/i],
    stabilityBias: 0.08,
  },
  {
    id: "halves",
    label: "Tempos",
    description: "Mercados de 1º tempo, 2º tempo e parcial da partida.",
    accent: "from-sky-500 to-cyan-500",
    patterns: [
      /first half/i,
      /1st half/i,
      /second half/i,
      /2nd half/i,
      /halftime/i,
      /half time/i,
      /firsthalf/i,
      /secondhalf/i,
    ],
    stabilityBias: 0.06,
  },
  {
    id: "team_totals",
    label: "Totais de time",
    description: "Gols do mandante/visitante e linhas por equipe.",
    accent: "from-orange-500 to-amber-500",
    patterns: [/total - away/i, /total - home/i, /team total/i, /home total/i, /away total/i],
    stabilityBias: 0.09,
  },
  {
    id: "shots",
    label: "Chutes",
    description: "Chutes, chutes no alvo e volume de finalização.",
    accent: "from-pink-500 to-rose-500",
    patterns: [
      /shots on target/i,
      /shot on target/i,
      /shot.?on.?goal/i,
      /shotongoal/i,
      /total shots/i,
      /shots/i,
      /attempts/i,
    ],
    stabilityBias: -0.01,
  },
  {
    id: "stats",
    label: "Estatísticas",
    description: "Faltas, impedimentos, passes, desarmes, laterais, tiros de meta e outras linhas.",
    accent: "from-blue-500 to-indigo-500",
    patterns: [
      /offside/i,
      /offsides/i,
      /pass/i,
      /passes/i,
      /tackle/i,
      /tackles/i,
      /interception/i,
      /interceptions/i,
      /foul/i,
      /fouls/i,
      /throw.?in/i,
      /throw ins/i,
      /goal kicks?/i,
      /goal kick/i,
      /saves?/i,
      /keeper saves?/i,
      /goalkeeper saves?/i,
      /clearances?/i,
      /blocks?/i,
    ],
    stabilityBias: -0.03,
  },
  {
    id: "result",
    label: "Resultado",
    description: "1x2, dupla chance, empate anula e vencedor do jogo.",
    accent: "from-cyan-500 to-teal-500",
    patterns: [
      /winner/i,
      /result/i,
      /double chance/i,
      /draw no bet/i,
      /home\/away/i,
      /match/i,
      /qualify/i,
      /to qualify/i,
      /advance/i,
      /classify/i,
      /champion/i,
      /outright/i,
      /win to nil/i,
      /margin/i,
      /correct score/i,
      /scorecast/i,
      /wincast/i,
      /timecast/i,
      /ht\/ft/i,
      /half time\/full time/i,
      /interval\/final/i,
    ],
    stabilityBias: 0.12,
  },
  {
    id: "corners",
    label: "Escanteios",
    description: "Linhas de corners quando o bookmaker disponibiliza.",
    accent: "from-lime-500 to-emerald-500",
    patterns: [/corner/i],
    stabilityBias: 0.02,
  },
  {
    id: "cards",
    label: "Cartões",
    description: "Cartões e disciplina de jogo.",
    accent: "from-rose-500 to-red-500",
    patterns: [/card/i],
    stabilityBias: -0.01,
  },
  {
    id: "players",
    label: "Jogador",
    description: "Artilheiro, assistências e props individuais do atleta.",
    accent: "from-fuchsia-500 to-pink-500",
    patterns: [
      /\bplayer\b/i,
      /anytime goal scorer/i,
      /first goal scorer/i,
      /last goal scorer/i,
      /first scorer/i,
      /last scorer/i,
      /goal scorer/i,
      /to score/i,
      /hat.?trick/i,
      /2\+ goals/i,
      /two or more goals/i,
      /player assists?/i,
      /player fouls committed/i,
      /player to be booked/i,
      /player shots?/i,
      /player shots on target/i,
      /player passes?/i,
      /player tackles?/i,
      /player interceptions?/i,
      /player saves?/i,
      /man of the match/i,
      /best player/i,
      /player singles/i,
      /player triples/i,
    ],
    stabilityBias: -0.04,
  },
  {
    id: "goals",
    label: "Gols",
    description: "Over/under, ambas marcam e totais de time.",
    accent: "from-amber-500 to-orange-500",
    patterns: [
      /goals? over\/under/i,
      /goal/i,
      /both teams/i,
      /btts/i,
      /odd\/even/i,
      /multigoals/i,
      /exact goals/i,
      /goal line/i,
      /goal in both halves/i,
      /time of first goal/i,
      /penalty/i,
      /own goal/i,
      /header/i,
      /free kick/i,
    ],
    stabilityBias: 0.1,
  },
];

export const SUPPORTED_MARKETS: SupportedMarketCategory[] = MARKET_RULES.map((rule) => ({
  id: rule.id,
  label: rule.label,
  description: rule.description,
  accent: rule.accent,
}));

export const DEFAULT_FILTERS: AnalysisFilters = {
  scanDate: getTodayDateInSaoPaulo(),
  horizonHours: 24,
  minOdd: 1.4,
  maxOdd: 1.65,
  pickCount: 10,
  targetAccumulatorOdd: 4,
  leagueIds: TOP_FOOTBALL_LEAGUES.map((league) => league.id),
  bookmakerIds: [],
  marketCategories: MARKET_RULES.map((rule) => rule.id),
  useWebSearch: true,
  includeSameGame: false,
};

export function normalizeAnalysisFilters(
  filters?: Partial<AnalysisFilters> | null,
): AnalysisFilters {
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    scanDate: resolveAllowedScanDate(filters?.scanDate),
    horizonHours: 24,
    leagueIds: Array.isArray(filters?.leagueIds)
      ? filters.leagueIds
      : DEFAULT_FILTERS.leagueIds,
    bookmakerIds: Array.isArray(filters?.bookmakerIds)
      ? filters.bookmakerIds
      : DEFAULT_FILTERS.bookmakerIds,
    marketCategories: Array.isArray(filters?.marketCategories)
      ? filters.marketCategories
      : DEFAULT_FILTERS.marketCategories,
    useWebSearch:
      typeof filters?.useWebSearch === "boolean"
        ? filters.useWebSearch
        : DEFAULT_FILTERS.useWebSearch,
    includeSameGame:
      typeof filters?.includeSameGame === "boolean"
        ? filters.includeSameGame
        : DEFAULT_FILTERS.includeSameGame,
  };
}

export const VERDICT_COPY: Record<
  string,
  { label: string; tone: string; accent: string }
> = {
  strong_yes: {
    label: "Agressiva com valor",
    tone: "edge forte + contexto consistente",
    accent: "text-emerald-300",
  },
  yes: {
    label: "Boa entrada",
    tone: "mercado saudável",
    accent: "text-cyan-300",
  },
  lean_yes: {
    label: "Entraria com cautela",
    tone: "precisa gestão de stake",
    accent: "text-amber-300",
  },
  pass: {
    label: "Melhor passar",
    tone: "sem edge suficiente",
    accent: "text-rose-300",
  },
};

export function resolveMarketCategory(name: string): MarketCategoryId | null {
  const normalized = name.toLowerCase();

  if (
    /\bplayer\b/.test(normalized) &&
    /(shot|assist|pass|tackle|interception|foul|save|booked|card)/.test(normalized)
  ) {
    return "players";
  }

  if (/corner|multicorners/.test(normalized)) {
    return "corners";
  }

  if (/card|yellow|red|booked|rcard/.test(normalized)) {
    return "cards";
  }

  if (
    /offside|offsides|pass|passes|tackle|tackles|interception|interceptions|foul|fouls|throw.?in|throw ins|goal kicks?|goal kick|keeper saves?|goalkeeper saves?|clearances?|blocks?/.test(
      normalized,
    )
  ) {
    return "stats";
  }

  if (
    /anytime goal scorer|first goal scorer|last goal scorer|first scorer|last scorer|goal scorer|to score|hat.?trick|player assists?|player to be booked|player singles|player triples|man of the match|best player/.test(
      normalized,
    )
  ) {
    return "players";
  }

  if (
    /shots on target|shot on target|shot.?on.?goal|shotongoal|total shots|shots|attempts/.test(
      normalized,
    )
  ) {
    return "shots";
  }

  if (
    /first half|1st half|second half|2nd half|halftime|half time|firsthalf|secondhalf|ht\/ft|half time\/full time|interval\/final|highest scoring half/.test(
      normalized,
    )
  ) {
    return "halves";
  }

  if (
    /total - away|total - home|team total|home total|away total|team to score first|team to score last|team to score next|team score a goal|to score in both halves by teams|both teams score 2\+/.test(
      normalized,
    )
  ) {
    return "team_totals";
  }

  for (const rule of MARKET_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(name))) {
      return rule.id;
    }
  }

  return null;
}

export function getMarketStabilityBias(category: MarketCategoryId): number {
  return MARKET_RULES.find((rule) => rule.id === category)?.stabilityBias ?? 0;
}
