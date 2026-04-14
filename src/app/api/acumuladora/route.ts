import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { DEFAULT_FILTERS, TOP_FOOTBALL_LEAGUES } from "@/lib/constants";
import { runFootballAnalysis } from "@/lib/analysis/engine";
import { getTodayDateInSaoPaulo, getTomorrowDateInSaoPaulo } from "@/lib/utils";
import type { AccumulatorSuggestion, AnalysisPick } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 800;

/** API-Football bookmaker ID for Bet365 */
const BET365_ID = 8;

const schema = z.object({
  targetOdd: z.number().min(40).max(1000),
  scanDate: z.enum(["today", "tomorrow"]).default("today"),
  /** Empty = all supported leagues */
  leagueIds: z.array(z.number()).default([]),
  /** Empty = all fixtures (no fixture filter) */
  fixtureIds: z.array(z.number()).default([]),
  marketCategories: z
    .array(z.enum(["result", "goals", "halves", "handicaps", "corners", "cards", "shots", "stats", "players", "team_totals"]))
    .default(["result", "goals", "halves", "handicaps"]),
});

/**
 * Greedy accumulator builder optimised for high-odd targets (40–1000).
 */
function buildGreedyAccumulator(
  picks: AnalysisPick[],
  targetOdd: number,
  fixtureIds: number[],
): AccumulatorSuggestion | null {
  // If specific fixtures were selected, restrict to those
  const candidates = fixtureIds.length
    ? picks.filter((p) => fixtureIds.includes(p.fixtureId))
    : picks;

  if (!candidates.length) return null;

  // Sort: confidence desc, then odds asc (more reliable picks first)
  const sorted = [...candidates].sort(
    (a, b) => b.confidence - a.confidence || a.bestOdd - b.bestOdd,
  );

  const selected: AnalysisPick[] = [];
  const usedFixtures = new Set<number>();
  let combinedOdd = 1;

  for (const pick of sorted) {
    if (combinedOdd >= targetOdd) break;
    if (usedFixtures.has(pick.fixtureId)) continue;
    selected.push(pick);
    usedFixtures.add(pick.fixtureId);
    combinedOdd = parseFloat((combinedOdd * pick.bestOdd).toFixed(4));
  }

  if (!selected.length) return null;

  const avgConfidence = selected.reduce((s, p) => s + p.confidence, 0) / selected.length;
  const legs = selected.length;
  const reached = combinedOdd >= targetOdd;

  return {
    targetOdd,
    combinedOdd,
    confidence: Math.round(avgConfidence),
    picks: selected,
    rationale: reached
      ? `Múltipla de ${legs} pernas atingiu o alvo de ${targetOdd}× (odd real: ${combinedOdd.toFixed(1)}×). Todos os picks são exclusivamente da Bet365.`
      : `Foram encontrados ${legs} picks da Bet365 — odd combinada: ${combinedOdd.toFixed(1)}×. Não foi possível atingir o alvo de ${targetOdd}× com os jogos disponíveis.`,
  };
}

export async function POST(request: Request) {
  if (!isAuthConfigured()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const { targetOdd, scanDate, leagueIds, fixtureIds, marketCategories } = body;

  const dateKey = scanDate === "tomorrow" ? getTomorrowDateInSaoPaulo() : getTodayDateInSaoPaulo();
  const leaguesForScan = leagueIds.length ? leagueIds : TOP_FOOTBALL_LEAGUES.map((l) => l.id);

  // Estimate how many picks we need; request extra to handle missing Bet365 lines
  const estimatedLegs = Math.ceil(Math.log(targetOdd) / Math.log(1.52)) + 4;
  const pickCount = Math.min(Math.max(estimatedLegs + 10, 20), 60);

  try {
    const result = await runFootballAnalysis(
      {
        ...DEFAULT_FILTERS,
        scanDate: dateKey,
        horizonHours: 36,
        minOdd: 1.3,
        maxOdd: 2.5,
        pickCount,
        reasoningEffort: "high",
        useWebSearch: false,
        leagueIds: leaguesForScan,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        marketCategories: marketCategories as any,
        bookmakerIds: [BET365_ID],
        includeSameGame: false,
      },
      session.username,
      { skipPersistence: true },
    );

    if (!result?.picks?.length) {
      return NextResponse.json(
        { error: "Nenhum pick Bet365 encontrado para o período selecionado. Tente outras ligas ou data." },
        { status: 404 },
      );
    }

    const accumulator = buildGreedyAccumulator(result.picks, targetOdd, fixtureIds);
    if (!accumulator) {
      return NextResponse.json(
        { error: "Não foi possível montar uma múltipla com os picks disponíveis." },
        { status: 404 },
      );
    }

    return NextResponse.json({ accumulator });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro interno." },
      { status: 500 },
    );
  }
}
