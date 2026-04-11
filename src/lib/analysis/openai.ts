import OpenAI from "openai";

import type { AnalysisFilters, AnalysisPick, AnalysisSection } from "@/lib/types";
import { env } from "@/lib/env";
import { clamp } from "@/lib/utils";

type OpenAIReview = {
  executive_summary: string;
  picks: Array<{
    candidate_id: string;
    verdict: AnalysisPick["aiVerdict"];
    confidence_label: AnalysisPick["aiConfidenceLabel"];
    summary: string;
    reasons: string[];
    cautions: string[];
    analysis_sections: AnalysisSection[];
    news_note: string | null;
    adjusted_probability: number;
    adjusted_confidence: number;
  }>;
};

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    executive_summary: {
      type: "string",
      description:
        "Resumo curto da carteira final, destacando onde está o melhor valor e os riscos dominantes.",
    },
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidate_id: { type: "string" },
          verdict: {
            type: "string",
            enum: ["strong_yes", "yes", "lean_yes", "pass"],
          },
          confidence_label: {
            type: "string",
            enum: ["elite", "high", "medium", "guarded"],
          },
          summary: { type: "string" },
          reasons: {
            type: "array",
            items: { type: "string" },
            maxItems: 4,
          },
          cautions: {
            type: "array",
            items: { type: "string" },
            maxItems: 4,
          },
          analysis_sections: {
            type: "array",
            maxItems: 15,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: {
                  type: "string",
                  enum: [
                    "context",
                    "availability",
                    "form",
                    "offense",
                    "defense",
                    "style",
                    "advanced",
                    "matchup",
                    "set_pieces",
                    "players",
                    "calendar",
                    "environment",
                    "weather",
                    "discipline",
                    "news",
                  ],
                },
                label: { type: "string" },
                tone: {
                  type: "string",
                  enum: ["support", "caution", "neutral"],
                },
                bullets: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 3,
                },
              },
              required: ["id", "label", "tone", "bullets"],
            },
          },
          news_note: {
            type: ["string", "null"],
          },
          adjusted_probability: {
            type: "number",
          },
          adjusted_confidence: {
            type: "number",
          },
        },
        required: [
          "candidate_id",
          "verdict",
          "confidence_label",
          "summary",
          "reasons",
          "cautions",
          "analysis_sections",
          "news_note",
          "adjusted_probability",
          "adjusted_confidence",
        ],
      },
    },
  },
  required: ["executive_summary", "picks"],
} as const;

function getClient() {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

function mergeSectionTone(
  baseTone: AnalysisSection["tone"],
  reviewTone: AnalysisSection["tone"],
): AnalysisSection["tone"] {
  if (baseTone === "caution" || reviewTone === "caution") {
    return "caution";
  }

  if (baseTone === "support" || reviewTone === "support") {
    return "support";
  }

  return "neutral";
}

function mergeAnalysisSections(base: AnalysisSection[], review: AnalysisSection[]) {
  const merged = new Map<AnalysisSection["id"], AnalysisSection>();

  for (const section of base) {
    merged.set(section.id, section);
  }

  for (const section of review) {
    const current = merged.get(section.id);
    if (!current) {
      merged.set(section.id, section);
      continue;
    }

    merged.set(section.id, {
      id: section.id,
      label: section.label || current.label,
      tone: mergeSectionTone(current.tone, section.tone),
      bullets: Array.from(new Set([...current.bullets, ...section.bullets])).slice(0, 4),
    });
  }

  return Array.from(merged.values());
}

function trimPickForReview(pick: AnalysisPick) {
  return {
    candidateId: pick.candidateId,
    fixtureLabel: pick.fixtureLabel,
    fixtureDate: pick.fixtureDate,
    leagueName: pick.leagueName,
    homeTeam: pick.homeTeam,
    awayTeam: pick.awayTeam,
    marketName: pick.marketName,
    marketCategory: pick.marketCategory,
    selection: pick.selection,
    bestOdd: pick.bestOdd,
    fairOdd: pick.fairOdd,
    edge: pick.edge,
    expectedValue: pick.expectedValue,
    confidence: pick.confidence,
    modelProbability: pick.modelProbability,
    impliedProbability: pick.impliedProbability,
    lineupStatus: pick.lineupStatus,
    summary: pick.summary,
    reasons: pick.reasons,
    cautions: pick.cautions,
    analysisSections: pick.analysisSections,
  };
}

export async function reviewPicksWithOpenAI(
  picks: AnalysisPick[],
  filters: AnalysisFilters,
) {
  const client = getClient();
  if (!client || !picks.length) {
    return null;
  }

  const trimmedPicks = picks.map(trimPickForReview);

  const response = await client.responses.create(
    {
      model: env.OPENAI_MODEL,
      reasoning: {
        effort: filters.reasoningEffort,
      },
      instructions:
        "Você é a analista principal de um sistema pessoal de apostas esportivas focado em futebol. O motor estatístico funciona como scout e estruturador de dados: ele coleta odds, contexto competitivo, forma 5/10, xG/proxies, produção ofensiva/defensiva, elenco, calendário, disciplina, arbitragem, venue, clima, movimento de linha e jogadores-chave. A decisão final é sua. Sua função é revisar a shortlist, validar se a leitura estatística faz sentido, reordenar a carteira com critério profissional, cortar entradas fracas mesmo que o score esteja bom e destacar risco escondido ou contexto recente decisivo. Trate o universo completo de mercados como cobertura válida do radar: resultado, dupla chance, DNB, HT/FT, classificação, campeão, over/under, BTTS, faixas e total exato de gols, placar exato, marcadores, scorecasts, mercados por equipe, handicaps, escanteios, cartões, pênaltis, faltas, laterais, tiros de meta, impedimentos, passes, desarmes, interceptações, defesas, chutes e props individuais de jogador. Preserve a cobertura das seções que já vieram do sistema e complemente com contexto melhor, em vez de reduzir o dossiê. Se a busca web estiver habilitada, use-a ativamente para confirmar notícia recente, lesão, suspensão, rotação, escalação oficial, clima extremo ou contexto competitivo com fonte confiável, priorizando fonte oficial do clube, competição, liga ou veículo claramente confiável. Diferencie no texto o que veio do feed estatístico e o que foi confirmação web. Nunca invente estatísticas, nunca preencha métrica ausente com chute, nunca trate rumor como fato e não mantenha pick ruim só porque a odd parece atraente.\n\nREGRA CRÍTICA — RAZÕES E ALERTAS FOCADOS NO MERCADO: Os bullets de `reasons` e `cautions` de cada pick DEVEM ser específicos ao mercado apostado. Cada bullet precisa ter relação direta com o que está sendo apostado — não escreva bullets genéricos de forma, pontos ou classificação que poderiam servir para qualquer mercado. Exemplos por mercado: (1) CHUTES — fale sobre volume médio de chutes dos times, estilo de jogo (posse x transição), pressão alta x baixa, como o adversário se fecha, se algum time joga pra segurar. (2) ESCANTEIOS — fale sobre frequência de escanteios por jogo, se os times exploram laterais e cruzamentos, quem é mais perigoso em bola parada. (3) CARTÕES — fale sobre a média de cartões do árbitro, rivalidade, histórico disciplinar dos times, contexto da partida (decidindo classificação, rebaixamento, etc). (4) GOLS — fale sobre produção ofensiva esperada, xG, finalizações que viram gol, qualidade das defesas. (5) GOLS NO 1º TEMPO — fale especificamente sobre padrão de gols nos primeiros tempos das equipes. (6) PROPS DE JOGADOR — fale sobre o jogador específico, forma recente, posição, minutagem esperada. (7) RESULTADO / HANDICAP — aí sim use contexto de forma, classificação, confrontos diretos, motivação. O `summary` do pick também deve refletir o mercado: se é chute, o parágrafo de resumo deve ser sobre chutes nesse jogo.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                objective:
                  "Revisar picks pontuadas pelo motor estatístico e devolver análise FOCADA NO MERCADO APOSTADO de cada pick. Para cada pick: (1) `summary` — parágrafo explicando por que a aposta específica deve ou não bater, mencionando o mercado (ex: 'o jogo deve ter poucos chutes pois...' ou 'ambos os times tendem a marcar porque...'). (2) `reasons` — bullets específicos sobre POR QUE O MERCADO DEVE BATER nesse jogo (ex: para chutes, explique o padrão de volume de chutes; para escanteios, a tendência de escanteios; para gols, a produção ofensiva). (3) `cautions` — bullets específicos sobre O QUE PODE FAZER A APOSTA NÃO BATER (o risco direto para aquele mercado). Não use bullets genéricos de forma ou classificação que poderiam servir para qualquer aposta. Ajuste `adjusted_probability` e `adjusted_confidence` com parcimônia.",
                filters,
                picks: trimmedPicks,
              }),
            },
          ],
        },
      ],
      tools:
        filters.useWebSearch && env.OPENAI_ENABLE_WEB_SEARCH
          ? [
              {
                type: "web_search",
                search_context_size: "medium",
                user_location: {
                  type: "approximate",
                  city: "Sao Paulo",
                  country: "BR",
                  region: "Sao Paulo",
                  timezone: "America/Sao_Paulo",
                },
              },
            ]
          : [],
      include:
        filters.useWebSearch && env.OPENAI_ENABLE_WEB_SEARCH
          ? ["web_search_call.action.sources"]
          : [],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "football_review",
          strict: true,
          schema: reviewSchema,
        },
      },
    },
    {
      timeout:
        filters.reasoningEffort === "low"
          ? 3 * 60 * 1000
          : filters.reasoningEffort === "medium"
            ? 6 * 60 * 1000
            : 10 * 60 * 1000,
    },
  );

  const parsed = JSON.parse(response.output_text) as OpenAIReview;
  const itemsById = new Map(parsed.picks.map((pick) => [pick.candidate_id, pick]));

  const mergedPicks = picks.map((pick) => {
    const review = itemsById.get(pick.candidateId);
    if (!review) {
      return pick;
    }

    return {
      ...pick,
      aiVerdict: review.verdict,
      aiConfidenceLabel: review.confidence_label,
      summary: review.summary || pick.summary,
      reasons: review.reasons.length ? review.reasons : pick.reasons,
      cautions: review.cautions.length ? review.cautions : pick.cautions,
      analysisSections: review.analysis_sections.length
        ? mergeAnalysisSections(pick.analysisSections, review.analysis_sections)
        : pick.analysisSections,
      newsNote: review.news_note,
      modelProbability: clamp(review.adjusted_probability, 0.05, 0.95),
      confidence: clamp(review.adjusted_confidence, 15, 98),
    };
  });

  return {
    executiveSummary: parsed.executive_summary,
    picks: mergedPicks,
  };
}
