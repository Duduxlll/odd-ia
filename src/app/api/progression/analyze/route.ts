import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { DEFAULT_FILTERS, TOP_FOOTBALL_LEAGUES } from "@/lib/constants";
import {
  failProgressionDayAnalysis,
  getActiveProgressionSession,
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

const schema = z.object({
  sessionId: z.string(),
  dayNumber: z.number().int().min(1),
  stake: z.number().min(0.01),
});

const ODD_MIN = 1.50;
const ODD_MAX = 1.60;

/**
 * Run the engine once. On the first attempt use a 36h window to maximise
 * coverage; if no in-range pick is found, widen to 60h.
 */
async function findBestPick(username: string) {
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
        leagueIds: TOP_FOOTBALL_LEAGUES.map((l) => l.id),
        marketCategories: ["result", "goals", "halves", "handicaps"],
      },
      username,
    );

    // Only accept picks strictly within the target range
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
    const { sessionId, dayNumber } = body;

    after(async () => {
      try {
        const bestPick = await findBestPick(username);

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
