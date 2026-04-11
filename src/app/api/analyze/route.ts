import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import {
  DEFAULT_FILTERS,
  SUPPORTED_MARKETS,
  normalizeAnalysisFilters,
} from "@/lib/constants";
import type { MarketCategoryId } from "@/lib/types";
import {
  clearAnalysisHistory,
  createAnalysisJob,
  failAnalysisJob,
  getDashboardState,
  getLatestAnalysisRun,
  getRunningAnalysisJob,
  saveDraftFilters,
} from "@/lib/db";
import { dispatchWorker } from "@/lib/worker";

export const runtime = "nodejs";
export const maxDuration = 800;

const supportedMarketCategoryIds = SUPPORTED_MARKETS.map((market) => market.id);

const filtersSchema = z.object({
  scanDate: z.string().min(10),
  horizonHours: z.number().min(12).max(96),
  minOdd: z.number().min(1.01).max(10),
  maxOdd: z.number().min(1.05).max(20),
  pickCount: z.number().min(1).max(25),
  targetAccumulatorOdd: z.number().min(1.1).max(40),
  leagueIds: z.array(z.number()),
  bookmakerIds: z.array(z.number()),
  marketCategories: z.array(
    z.custom<MarketCategoryId>(
      (value) =>
        typeof value === "string" &&
        supportedMarketCategoryIds.includes(value as MarketCategoryId),
      { message: "Família de mercado inválida." },
    ),
  ),
  useWebSearch: z.boolean(),
  includeSameGame: z.boolean(),
  reasoningEffort: z.enum(["high", "medium", "low"]).default("medium"),
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
      draftFilters: normalizeAnalysisFilters(dashboardState.draftFilters ?? DEFAULT_FILTERS),
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
    const filters = normalizeAnalysisFilters(filtersSchema.parse(body));

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
    const filters = normalizeAnalysisFilters(filtersSchema.parse(body));
    const origin = new URL(request.url).origin;

    await saveDraftFilters(session.username, filters);

    const currentJob = await getRunningAnalysisJob(session.username);
    if (currentJob) {
      return NextResponse.json({ job: currentJob }, { status: 202 });
    }

    const job = await createAnalysisJob(session.username, filters);

    after(async () => {
      await dispatchWorker(origin, job.id);
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

export async function DELETE(request: Request) {
  try {
    const session = await requireAuthenticatedSession();
    const force = new URL(request.url).searchParams.has("force");
    const dashboardState = await getDashboardState(session.username);

    if (
      dashboardState.activeJob?.status === "running" ||
      dashboardState.activeJob?.status === "queued"
    ) {
      if (!force) {
        return NextResponse.json(
          { error: "Existe uma análise em andamento. Aguarde a conclusão antes de limpar." },
          { status: 409 },
        );
      }
      await failAnalysisJob(
        session.username,
        dashboardState.activeJob.id,
        "Análise cancelada pelo usuário para reiniciar o scan.",
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
