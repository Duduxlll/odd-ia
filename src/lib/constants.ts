import type {
  AnalysisFilters,
  MarketCategoryId,
  SupportedLeague,
  SupportedMarketCategory,
} from "@/lib/types";

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
    patterns: [/first half/i, /1st half/i, /second half/i, /2nd half/i, /halftime/i, /half time/i],
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
    patterns: [/shots on target/i, /shot on target/i, /shots/i, /attempts/i],
    stabilityBias: -0.01,
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
    patterns: [/player/i, /scorer/i, /assist/i, /goal scorer/i, /to score/i],
    stabilityBias: -0.04,
  },
  {
    id: "goals",
    label: "Gols",
    description: "Over/under, ambas marcam e totais de time.",
    accent: "from-amber-500 to-orange-500",
    patterns: [/goal/i, /over/i, /under/i, /both teams/i, /btts/i, /total/i],
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
  scanDate: new Date().toISOString().slice(0, 10),
  horizonHours: 36,
  minOdd: 1.4,
  maxOdd: 1.65,
  pickCount: 10,
  targetAccumulatorOdd: 4,
  leagueIds: TOP_FOOTBALL_LEAGUES.map((league) => league.id),
  marketCategories: MARKET_RULES.map((rule) => rule.id),
  useWebSearch: true,
  includeSameGame: false,
};

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
