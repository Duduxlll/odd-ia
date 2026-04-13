import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { resetProgressionSession } from "@/lib/db";

export const runtime = "nodejs";

async function requireSession() {
  if (!isAuthConfigured()) throw new Error("Autenticação não configurada.");
  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) throw new Error("Sessão inválida ou ausente.");
  return session;
}

const schema = z.object({ sessionId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const authSession = await requireSession();
    const body = schema.parse(await request.json());
    const newSession = await resetProgressionSession(body.sessionId, authSession.username);
    return NextResponse.json({ session: newSession });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro." }, { status: 400 });
  }
}
