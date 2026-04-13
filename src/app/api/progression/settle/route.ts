import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { getActiveProgressionSession, settleProgressionDay } from "@/lib/db";
import { fetchFixtureResult } from "@/lib/providers/api-football";

export const runtime = "nodejs";

async function requireSession() {
  if (!isAuthConfigured()) throw new Error("Autenticação não configurada.");
  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) throw new Error("Sessão inválida ou ausente.");
  return session;
}

const schema = z.object({
  sessionId: z.string().uuid(),
  dayNumber: z.number().int().min(1),
  forceResult: z.enum(["won", "lost"]).optional(),
});

export async function POST(request: Request) {
  try {
    const authSession = await requireSession();
    const body = schema.parse(await request.json());

    const active = await getActiveProgressionSession(authSession.username);
    if (!active || active.id !== body.sessionId) {
      return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
    }

    const day = active.days.find((d) => d.dayNumber === body.dayNumber);
    if (!day || day.status !== "open") {
      return NextResponse.json({ error: "Dia não está aberto para liquidação." }, { status: 409 });
    }

    // If manual override, apply immediately
    if (body.forceResult) {
      await settleProgressionDay(body.sessionId, authSession.username, body.dayNumber, body.forceResult);
      return NextResponse.json({ result: body.forceResult });
    }

    // Try auto-detect from API-Football
    if (!day.fixtureId || !day.pick) {
      return NextResponse.json({ error: "Sem fixture associada para verificação automática." }, { status: 400 });
    }

    const fixtureResult = await fetchFixtureResult(day.fixtureId, day.pick);
    if (!fixtureResult) {
      return NextResponse.json({ status: "pending", message: "Jogo ainda não terminou ou resultado não disponível." });
    }

    await settleProgressionDay(body.sessionId, authSession.username, body.dayNumber, fixtureResult);
    return NextResponse.json({ result: fixtureResult });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro." }, { status: 400 });
  }
}
