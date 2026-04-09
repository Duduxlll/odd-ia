import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { runFootballAnalysis } from "@/lib/analysis/engine";
import { clearAnalysisHistory } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

const filtersSchema = z.object({
  scanDate: z.string().min(10),
  horizonHours: z.number().min(12).max(96),
  minOdd: z.number().min(1.01).max(10),
  maxOdd: z.number().min(1.05).max(20),
  pickCount: z.number().min(1).max(25),
  targetAccumulatorOdd: z.number().min(1.1).max(40),
  leagueIds: z.array(z.number()),
  marketCategories: z.array(
    z.enum(["result", "goals", "corners", "cards", "players"]),
  ),
  useWebSearch: z.boolean(),
  includeSameGame: z.boolean(),
});

async function assertAuthenticated() {
  if (!isAuthConfigured()) {
    throw new AuthError(
      503,
      "Autenticação não configurada. Defina AUTH_USERNAME, AUTH_PASSWORD e AUTH_SECRET.",
    );
  }

  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) {
    throw new AuthError(401, "Sessão inválida ou ausente.");
  }
}

export async function POST(request: Request) {
  try {
    await assertAuthenticated();
    const body = await request.json();
    const filters = filtersSchema.parse(body);
    const run = await runFootballAnalysis(filters);

    return NextResponse.json({ run });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível executar a análise agora.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    await assertAuthenticated();
    await clearAnalysisHistory();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível limpar a análise agora.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
