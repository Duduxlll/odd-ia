import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { DEFAULT_FILTERS, TOP_FOOTBALL_LEAGUES } from "@/lib/constants";
import { runFootballAnalysis } from "@/lib/analysis/engine";
import { getTodayDateInSaoPaulo } from "@/lib/utils";
import type { AccumulatorSuggestion, AnalysisPick } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 800;

/** API-Football bookmaker ID for Bet365 */
const BET365_ID = 8;

const schema = z.object({
  targetOdd: z.number().min(40).max(1000),
});

/**
 * Greedy accumulator builder optimised for high-odd targets (40–1000).
 *
 * Strategy:
 * 1. Sort picks by confidence desc (most reliable first)
 * 2. Add each pick if it doesn't duplicate a fixture already in the slip
 * 3. Stop when combinedOdd >= targetOdd or picks run out
 */
function buildGreedyAccumulator(
  picks: AnalysisPick[],
  targetOdd: number,
): AccumulatorSuggestion | null {
  // Sort: confidence desc, then by odds asc (prefer lower odds to reduce variance)
  const sorted = [...picks].sort(
    (a, b) => b.confidence - a.confidence || a.bestOdd - b.bestOdd,
  );

  const selected: AnalysisPick[] = [];
  const usedFixtures = new Set<number>();
  let combinedOdd = 1;

  for (const pick of sorted) {
    if (combinedOdd >= targetOdd) break;
    if (usedFixtures.has(pick.fixtureId)) continue; // one leg per match
    selected.push(pick);
    usedFixtures.add(pick.fixtureId);
    combinedOdd = parseFloat((combinedOdd * pick.bestOdd).toFixed(4));
  }

  if (!selected.length) return null;

  const avgConfidence =
    selected.reduce((s, p) => s + p.confidence, 0) / selected.length;

  const legs = selected.length;
  const reached = combinedOdd >= targetOdd;

  return {
    targetOdd,
    combinedOdd,
    confidence: Math.round(avgConfidence),
    picks: selected,
    rationale: reached
      ? `Múltipla de ${legs} pernas atingiu o alvo de ${targetOdd}× (odd real: ${combinedOdd.toFixed(1)}×). Todos os picks são exclusivamente da Bet365.`
      : `Foram encontrados ${legs} picks da Bet365 — odd combinada: ${combinedOdd.toFixed(1)}×. Não foi possível atingir o alvo de ${targetOdd}× com os jogos disponíveis hoje.`,
  };
}

export async function POST(request: Request) {
  if (!isAuthConfigured()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  let body: { targetOdd: number };
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "targetOdd deve estar entre 40 e 1000." }, { status: 400 });
  }

  const { targetOdd } = body;

  // How many picks do we need? e.g. 1.55^n = targetOdd → n = log(targetOdd)/log(1.55)
  // Request ~25% more than needed to account for missing Bet365 lines.
  const estimatedLegs = Math.ceil(Math.log(targetOdd) / Math.log(1.52)) + 4;
  const pickCount = Math.min(Math.max(estimatedLegs + 8, 20), 60);

  try {
    const result = await runFootballAnalysis(
      {
        ...DEFAULT_FILTERS,
        scanDate: getTodayDateInSaoPaulo(),
        horizonHours: 48,
        // Wide odd range so we have more candidates to combine
        minOdd: 1.3,
        maxOdd: 2.5,
        pickCount,
        reasoningEffort: "high",
        useWebSearch: false,
        leagueIds: TOP_FOOTBALL_LEAGUES.map((l) => l.id),
        marketCategories: ["result", "goals", "halves", "handicaps"],
        bookmakerIds: [BET365_ID],
        includeSameGame: false,
      },
      session.username,
      { skipPersistence: true },
    );

    if (!result?.picks?.length) {
      return NextResponse.json(
        { error: "Nenhum pick Bet365 encontrado para o período. Tente novamente mais tarde." },
        { status: 404 },
      );
    }

    const accumulator = buildGreedyAccumulator(result.picks, targetOdd);
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
