import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { getCachedFixturesByDate } from "@/lib/prefetch";
import { getTodayDateInSaoPaulo, getTomorrowDateInSaoPaulo } from "@/lib/utils";

export const runtime = "nodejs";

export type AccumuladoraFixture = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string; // ISO string
  leagueId: number;
  leagueName: string;
  leagueCountry: string;
};

export type AccumuladoraLeague = {
  id: number;
  name: string;
  country: string;
  count: number;
};

export type AccumuladoraFixturesResponse = {
  today: { date: string; leagues: AccumuladoraLeague[]; fixtures: AccumuladoraFixture[] };
  tomorrow: { date: string; leagues: AccumuladoraLeague[]; fixtures: AccumuladoraFixture[] };
};

function processFixtures(
  rawFixtures: Awaited<ReturnType<typeof getCachedFixturesByDate>>,
  nowMs: number,
): { leagues: AccumuladoraLeague[]; fixtures: AccumuladoraFixture[] } {
  const leagueMap = new Map<number, AccumuladoraLeague>();
  const fixtures: AccumuladoraFixture[] = [];

  for (const f of rawFixtures) {
    const kickoff = new Date(f.fixture.date).getTime();
    if (!Number.isFinite(kickoff) || kickoff <= nowMs) continue;

    const { id: leagueId, name, country } = f.league;
    const entry = leagueMap.get(leagueId);
    if (entry) {
      entry.count++;
    } else {
      leagueMap.set(leagueId, { id: leagueId, name: name || `Liga ${leagueId}`, country: country || "", count: 1 });
    }

    fixtures.push({
      id: f.fixture.id,
      homeTeam: f.teams.home.name,
      awayTeam: f.teams.away.name,
      kickoff: f.fixture.date,
      leagueId,
      leagueName: name || `Liga ${leagueId}`,
      leagueCountry: country || "",
    });
  }

  const leagues = Array.from(leagueMap.values()).sort((a, b) =>
    b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name),
  );

  fixtures.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  return { leagues, fixtures };
}

export async function GET() {
  if (!isAuthConfigured()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const today = getTodayDateInSaoPaulo();
  const tomorrow = getTomorrowDateInSaoPaulo();
  const nowMs = Date.now();

  const [rawToday, rawTomorrow] = await Promise.all([
    getCachedFixturesByDate(today).catch(() => []),
    getCachedFixturesByDate(tomorrow).catch(() => []),
  ]);

  return NextResponse.json({
    today: { date: today, ...processFixtures(rawToday, nowMs) },
    tomorrow: { date: tomorrow, ...processFixtures(rawTomorrow, nowMs) },
  } satisfies AccumuladoraFixturesResponse);
}
