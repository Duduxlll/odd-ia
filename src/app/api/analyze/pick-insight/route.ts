import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import OpenAI from "openai";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { env } from "@/lib/env";
import type { AnalysisPick } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type InsightDirection = "favor" | "caution";

type InsightPayload = {
  direction: InsightDirection;
  pick: Pick<
    AnalysisPick,
    | "candidateId"
    | "fixtureLabel"
    | "homeTeam"
    | "awayTeam"
    | "leagueName"
    | "marketName"
    | "marketCategory"
    | "selection"
    | "bestOdd"
    | "modelProbability"
    | "confidence"
    | "reasons"
    | "cautions"
    | "analysisSections"
    | "summary"
  >;
};

function buildInsightPrompt(payload: InsightPayload): string {
  const { direction, pick } = payload;
  const probPct = (pick.modelProbability * 100).toFixed(1);

  const sectionsText = pick.analysisSections
    .map((s) => {
      const bullets = s.bullets.map((b) => `  - ${b}`).join("\n");
      return `[${s.label.toUpperCase()}]\n${bullets}`;
    })
    .join("\n\n");

  if (direction === "favor") {
    return `Você é um analista de apostas esportivas especializado. Analise esta aposta e escreva por que ela TEM CHANCE DE BATER.

APOSTA:
- Jogo: ${pick.fixtureLabel}
- Campeonato: ${pick.leagueName}
- Mercado: ${pick.marketName} (categoria: ${pick.marketCategory})
- Seleção: ${pick.selection}
- Odd: ${pick.bestOdd.toFixed(2)}
- Probabilidade do modelo: ${probPct}%

DADOS REAIS DO JOGO:
${sectionsText}

INSTRUÇÕES:
Escreva 3 parágrafos explicando por que "${pick.selection}" tem chance de bater.
Foque EXCLUSIVAMENTE no mercado "${pick.marketCategory}" — use os dados reais acima.
Se for escanteios: mencione médias de corners, estilo de jogo, tendências de bola parada.
Se for gols: mencione produção ofensiva, xG, defesas, médias de gols.
Se for chutes: mencione volume de chutes, chutes no alvo, estilo tático.
Se for cartões: mencione árbitro, histórico disciplinar, contexto do jogo.
Se for resultado/handicap: mencione forma, confronto direto, força relativa.
Seja específico com os números reais. Não invente dados. Tom analítico e direto.`;
  }

  return `Você é um analista de apostas esportivas especializado. Analise esta aposta e escreva por que ela PODE NÃO BATER — os riscos reais.

APOSTA:
- Jogo: ${pick.fixtureLabel}
- Campeonato: ${pick.leagueName}
- Mercado: ${pick.marketName} (categoria: ${pick.marketCategory})
- Seleção: ${pick.selection}
- Odd: ${pick.bestOdd.toFixed(2)}
- Probabilidade do modelo: ${probPct}%

DADOS REAIS DO JOGO:
${sectionsText}

INSTRUÇÕES:
Escreva 3 parágrafos explicando os RISCOS e por que "${pick.selection}" pode falhar.
Foque EXCLUSIVAMENTE no mercado "${pick.marketCategory}" — use os dados reais acima.
Se for escanteios: o que poderia reduzir os corners nesse jogo? Times fechados? Jogo direto?
Se for gols: o que pode travar o placar? Defesas sólidas? Motivação? Contexto?
Se for chutes: o que pode diminuir o volume de chutes? Pressão baixa? Jogo reativo?
Se for cartões: o que pode fazer o jogo ser limpo? Árbitro permissivo? Jogo amistoso?
Se for resultado/handicap: o que pode fazer o favoritismo não se confirmar?
Seja específico com os números reais. Não invente dados. Tom analítico e honesto.`;
}

export async function POST(request: Request) {
  try {
    if (!isAuthConfigured()) {
      return NextResponse.json({ error: "Autenticação não configurada." }, { status: 503 });
    }

    const cookieStore = await cookies();
    const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
    if (!session) {
      return NextResponse.json({ error: "Sessão inválida ou ausente." }, { status: 401 });
    }

    if (!env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI não configurado." }, { status: 503 });
    }

    const body = (await request.json()) as InsightPayload;
    if (!body.direction || !body.pick?.candidateId) {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const prompt = buildInsightPrompt(body);

    const response = await client.chat.completions.create(
      {
        model: "gpt-4o",
        temperature: 0.4,
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      },
      { timeout: 45 * 1000 },
    );

    const analysis = response.choices[0]?.message?.content?.trim() ?? "";
    if (!analysis) {
      return NextResponse.json({ error: "IA não retornou análise." }, { status: 500 });
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar análise.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
