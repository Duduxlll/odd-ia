import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { deleteProgressionSession, endProgressionSession } from "@/lib/db";

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
  // "end" marks as lost (keeps in history), "delete" wipes completely
  mode: z.enum(["end", "delete"]).default("end"),
});

export async function POST(request: Request) {
  try {
    const authSession = await requireSession();
    const body = schema.parse(await request.json());
    if (body.mode === "delete") {
      await deleteProgressionSession(body.sessionId, authSession.username);
    } else {
      await endProgressionSession(body.sessionId, authSession.username);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro." }, { status: 400 });
  }
}
