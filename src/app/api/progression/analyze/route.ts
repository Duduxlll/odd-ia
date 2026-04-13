import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { DEFAULT_FILTERS, TOP_FOOTBALL_LEAGUES } from "@/lib/constants";
import {
  failProgressionDayAnalysis,
  getActiveProgressionSession,
  getRecentPicksInRange,
  openProgressionDay,
  setProgressionDayAnalyzing,
} from "@/lib/db";
import { runFootballAnalysis } from "@/lib/analysis/engine";
import { getTodayDateInSaoPaulo } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 800;

async function requireSession() {
  if (!isAuthConfigured()) throw new Error("Autenticação não configurada.");
  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) throw new Error("Sessão inválida ou ausente.");
  return session;
}

const PRIORITY_LEAGUE_IDS = [39, 140, 135, 78, 71]; // PL, La Liga, Serie A, Bundesliga, Brasileirão

const schema = z.object({
  sessionId: z.string(),
  dayNumber: z.number().int().min(1),
  stake: z.number().min(0.01),
  leagueMode: z.enum(["all", "priority"]).default("priority"),
  marketCategories: z.array(z.enum(["result", "goals", "halves", "handicaps", "corners", "cards", "shots", "stats", "players", "team_totals"])).default(["result", "goals", "halves", "handicaps"]),
});

const ODD_MIN = 1.50;
const ODD_MAX = 1.60;

/**
 * Fast path: check picks from recent DB analysis runs (last 48h) before running the full engine.
 */
async function findPickFast(
  username: string,
  leagueIds: number[],
  marketCategories: string[],
) {
  const picks = await getRecentPicksInRange(username, ODD_MIN, ODD_MAX, leagueIds, marketCategories);
  return picks.find((p) => p.bestOdd >= ODD_MIN && p.bestOdd <= ODD_MAX) ?? null;
}

/**
 * Run the full engine. Tries 36h then 60h horizon to maximise coverage.
 */
async function findBestPickFull(
  username: string,
  leagueIds: number[],
  marketCategories: string[],
) {
  for (const horizonHours of [36, 60]) {
    const result = await runFootballAnalysis(
      {
        ...DEFAULT_FILTERS,
        scanDate: getTodayDateInSaoPaulo(),
        horizonHours,
        minOdd: ODD_MIN,
        maxOdd: ODD_MAX,
        pickCount: 10,
        reasoningEffort: "high",
        useWebSearch: false,
        leagueIds,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        marketCategories: marketCategories as any,
      },
      username,
    );

    const bestPick = (result?.picks ?? []).find(
      (p) => p.bestOdd >= ODD_MIN && p.bestOdd <= ODD_MAX,
    ) ?? null;

    if (bestPick) return bestPick;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const authSession = await requireSession();
    const body = schema.parse(await request.json());

    const active = await getActiveProgressionSession(authSession.username);
    if (!active || active.id !== body.sessionId) {
      return NextResponse.json({ error: "Sessão de progressão não encontrada." }, { status: 404 });
    }

    const existingDay = active.days.find((d) => d.dayNumber === body.dayNumber);
    if (existingDay && (existingDay.status === "open" || existingDay.status === "won" || existingDay.status === "lost")) {
      return NextResponse.json({ error: "Este dia já foi liquidado." }, { status: 409 });
    }

    // Mark day as "analyzing" immediately (upserts if already exists from a retry)
    await setProgressionDayAnalyzing(body.sessionId, authSession.username, body.dayNumber, body.stake);

    const username = authSession.username;
    const { sessionId, dayNumber, leagueMode, marketCategories } = body;
    const leagueIds = leagueMode === "priority"
      ? PRIORITY_LEAGUE_IDS
      : TOP_FOOTBALL_LEAGUES.map((l) => l.id);

    after(async () => {
      try {
        // Fast path: check existing DB picks first (avoids full engine run when possible)
        let bestPick = await findPickFast(username, leagueIds, marketCategories);

        if (!bestPick) {
          // Full engine run
          bestPick = await findBestPickFull(username, leagueIds, marketCategories);
        }

        if (!bestPick) {
          // No pick found — reset to pending so user can try again
          await failProgressionDayAnalysis(sessionId, dayNumber);
          return;
        }

        await openProgressionDay(sessionId, dayNumber, bestPick, bestPick.bestOdd, bestPick.fixtureId);
      } catch {
        await failProgressionDayAnalysis(sessionId, dayNumber).catch(() => null);
      }
    });

    return NextResponse.json({ ok: true, status: "analyzing" }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro." }, { status: 400 });
  }
}
