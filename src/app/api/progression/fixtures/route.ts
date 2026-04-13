import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { getCachedFixturesByDate } from "@/lib/prefetch";
import { getTodayDateInSaoPaulo, getTomorrowDateInSaoPaulo } from "@/lib/utils";

export const runtime = "nodejs";

export type FixtureLeagueEntry = {
  id: number;
  name: string;
  country: string;
  count: number;
};

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

  // Build league map from ALL cached fixtures in the next ~48h
  const leagueMap = new Map<number, FixtureLeagueEntry>();

  for (const fixture of [...fixturesToday, ...fixturesTomorrow]) {
    const kickoff = new Date(fixture.fixture.date).getTime();
    if (!Number.isFinite(kickoff) || kickoff <= nowMs) continue;

    const { id, name, country } = fixture.league;
    const entry = leagueMap.get(id);
    if (entry) {
      entry.count++;
    } else {
      leagueMap.set(id, { id, name: name || `Liga ${id}`, country: country || "", count: 1 });
    }
  }

  // Sort by game count desc, then name asc
  const leagues = Array.from(leagueMap.values()).sort((a, b) =>
    b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name),
  );

  return NextResponse.json({ leagues });
}
