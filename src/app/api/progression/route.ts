import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import {
  createProgressionSession,
  getActiveProgressionSession,
  getAllProgressionSessions,
} from "@/lib/db";

export const runtime = "nodejs";

function authError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

async function requireSession() {
  if (!isAuthConfigured()) throw new Error("Autenticação não configurada.");
  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) throw new Error("Sessão inválida ou ausente.");
  return session;
}

export async function GET() {
  try {
    const session = await requireSession();
    const [active, history] = await Promise.all([
      getActiveProgressionSession(session.username),
      getAllProgressionSessions(session.username),
    ]);
    return NextResponse.json({ active, history });
  } catch (e) {
    return authError(401, e instanceof Error ? e.message : "Erro.");
  }
}

const createSchema = z.object({ startAmount: z.number().min(1).max(100000) });

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = createSchema.parse(await request.json());
    const active = await getActiveProgressionSession(session.username);
    if (active) {
      return NextResponse.json({ error: "Já existe uma sessão ativa. Resete-a antes de criar uma nova." }, { status: 409 });
    }
    const newSession = await createProgressionSession(session.username, body.startAmount);
    return NextResponse.json({ session: newSession }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro." }, { status: 400 });
  }
}
