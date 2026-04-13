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

const MARKET_CATEGORIES = ["result", "goals", "halves", "handicaps"] as const;
const ODD_MIN = 1.50;
const ODD_MAX = 1.60;
const MAX_RETRIES = 4;

// Try progressively wider scan windows to find a pick in the target odds range
async function findBestPickWithRetry(username: string) {
  const horizons = [24, 36, 48, 72];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const horizonHours = horizons[attempt] ?? 72;
    const result = await runFootballAnalysis(
      {
        ...DEFAULT_FILTERS,
        scanDate: getTodayDateInSaoPaulo(),
        horizonHours,
        minOdd: ODD_MIN,
        maxOdd: ODD_MAX,
        pickCount: 8,
        reasoningEffort: "high",
        useWebSearch: false,
        leagueIds: TOP_FOOTBALL_LEAGUES.map((l) => l.id),
        marketCategories: [...MARKET_CATEGORIES],
      },
      username,
    );

    const bestPick = result?.picks?.[0] ?? null;
    if (bestPick && bestPick.bestOdd >= ODD_MIN && bestPick.bestOdd <= ODD_MAX) {
      return bestPick;
    }

    // Short pause between retries to avoid hammering the APIs
    await new Promise((r) => setTimeout(r, 3000));
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
    if (existingDay && existingDay.status !== "pending") {
      return NextResponse.json({ error: "Este dia já foi aberto." }, { status: 409 });
    }

    await setProgressionDayAnalyzing(body.sessionId, authSession.username, body.dayNumber, body.stake);

    const username = authSession.username;
    const { sessionId, dayNumber } = body;

    after(async () => {
      try {
        const bestPick = await findBestPickWithRetry(username);

        if (!bestPick) {
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
