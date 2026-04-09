import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getAuthCookieOptions,
  isAuthConfigured,
  validateCredentials,
} from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const loginSchema = z.object({
  password: z.string().min(1).max(256),
  username: z.string().trim().min(1).max(64),
});

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Autenticação não configurada. Defina AUTH_USERNAME, AUTH_PASSWORD e AUTH_SECRET.",
      },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const credentials = loginSchema.parse(body);

    if (!validateCredentials(credentials.username, credentials.password)) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set(
      AUTH_COOKIE_NAME,
      createSessionToken(env.AUTH_USERNAME ?? credentials.username.trim()),
      getAuthCookieOptions(),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível entrar agora.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
