import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { runFootballAnalysis } from "@/lib/analysis/engine";
import { DEFAULT_FILTERS } from "@/lib/constants";
import {
  clearAnalysisHistory,
  completeAnalysisJob,
  createAnalysisJob,
  failAnalysisJob,
  getDashboardState,
  getLatestAnalysisRun,
  getRunningAnalysisJob,
  saveDraftFilters,
  touchAnalysisJob,
} from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 800;

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

async function requireAuthenticatedSession() {
  if (!isAuthConfigured()) {
    throw new AuthError(
      503,
      "Autenticação não configurada. Defina AUTH_SECRET e pelo menos um login em AUTH_USERNAME/AUTH_PASSWORD ou AUTH_USERS_JSON.",
    );
  }

  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) {
    throw new AuthError(401, "Sessão inválida ou ausente.");
  }

  return session;
}

export async function GET() {
  try {
    const session = await requireAuthenticatedSession();
    const [latestRun, dashboardState] = await Promise.all([
      getLatestAnalysisRun(session.username),
      getDashboardState(session.username),
    ]);

    return NextResponse.json({
      activeJob: dashboardState.activeJob,
      draftFilters: dashboardState.draftFilters ?? DEFAULT_FILTERS,
      latestRun,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar o estado do radar agora.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAuthenticatedSession();
    const body = await request.json();
    const filters = filtersSchema.parse(body);

    await saveDraftFilters(session.username, filters);
    return NextResponse.json({ ok: true, filters });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível salvar os filtros agora.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedSession();
    const body = await request.json();
    const filters = filtersSchema.parse(body);

    await saveDraftFilters(session.username, filters);

    const currentJob = await getRunningAnalysisJob(session.username);
    if (currentJob) {
      return NextResponse.json({ job: currentJob }, { status: 202 });
    }

    const job = await createAnalysisJob(session.username, filters);

    after(async () => {
      try {
        await touchAnalysisJob(session.username, job.id, "Inicializando scan em segundo plano.");
        await runFootballAnalysis(filters, session.username, {
          onProgress: (message) => touchAnalysisJob(session.username, job.id, message),
        });
        await completeAnalysisJob(session.username, job.id);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível concluir a análise em segundo plano.";
        await failAnalysisJob(session.username, job.id, message);
      }
    });

    return NextResponse.json({ job }, { status: 202 });
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
    const session = await requireAuthenticatedSession();
    const dashboardState = await getDashboardState(session.username);

    if (dashboardState.activeJob?.status === "running") {
      return NextResponse.json(
        { error: "Existe uma análise em andamento. Aguarde a conclusão antes de limpar." },
        { status: 409 },
      );
    }

    await clearAnalysisHistory(session.username);
    return NextResponse.json({ ok: true, filters: DEFAULT_FILTERS });
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
