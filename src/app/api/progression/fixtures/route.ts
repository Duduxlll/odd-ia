import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { TOP_FOOTBALL_LEAGUES } from "@/lib/constants";
import { getCachedFixturesByDate } from "@/lib/prefetch";
import { getTodayDateInSaoPaulo, getTomorrowDateInSaoPaulo } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  if (!isAuthConfigured()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const today = getTodayDateInSaoPaulo();
  const tomorrow = getTomorrowDateInSaoPaulo();
  const nowMs = Date.now();

  const [fixturesToday, fixturesTomorrow] = await Promise.all([
    getCachedFixturesByDate(today).catch(() => []),
    getCachedFixturesByDate(tomorrow).catch(() => []),
  ]);

  // Count upcoming fixtures per league (next ~48h)
  const allFixtures = [...fixturesToday, ...fixturesTomorrow];
  const leagueCounts: Record<number, number> = {};

  for (const fixture of allFixtures) {
    const kickoff = new Date(fixture.fixture.date).getTime();
    if (!Number.isFinite(kickoff) || kickoff <= nowMs) continue;
    const id = fixture.league.id;
    leagueCounts[id] = (leagueCounts[id] ?? 0) + 1;
  }

  // Return only the leagues we support, enriched with counts
  const leagues = TOP_FOOTBALL_LEAGUES.map((l) => ({
    id: l.id,
    name: l.name,
    country: l.country,
    count: leagueCounts[l.id] ?? 0,
  }));

  return NextResponse.json({ leagues });
}
