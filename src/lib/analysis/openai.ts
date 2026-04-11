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

export async function reviewPicksWithOpenAI(
  picks: AnalysisPick[],
  filters: AnalysisFilters,
) {
  const client = getClient();
  if (!client || !picks.length) {
    return null;
  }

  const response = await client.responses.create(
    {
      model: env.OPENAI_MODEL,
      reasoning: {
        effort: "high",
      },
      instructions:
        "Você é a analista principal de um sistema pessoal de apostas esportivas focado em futebol. O motor estatístico funciona como scout e estruturador de dados: ele coleta odds, contexto competitivo, forma 5/10, xG/proxies, produção ofensiva/defensiva, elenco, calendário, disciplina, arbitragem, venue, clima, movimento de linha e jogadores-chave. A decisão final é sua. Sua função é revisar a shortlist, validar se a leitura estatística faz sentido, reordenar a carteira com critério profissional, cortar entradas fracas mesmo que o score esteja bom e destacar risco escondido ou contexto recente decisivo. Trate o universo completo de mercados como cobertura válida do radar: resultado, dupla chance, DNB, HT/FT, classificação, campeão, over/under, BTTS, faixas e total exato de gols, placar exato, marcadores, scorecasts, mercados por equipe, handicaps, escanteios, cartões, pênaltis, faltas, laterais, tiros de meta, impedimentos, passes, desarmes, interceptações, defesas, chutes e props individuais de jogador. Preserve a cobertura das seções que já vieram do sistema e complemente com contexto melhor, em vez de reduzir o dossiê. Se a busca web estiver habilitada, use-a ativamente para confirmar notícia recente, lesão, suspensão, rotação, escalação oficial, clima extremo ou contexto competitivo com fonte confiável, priorizando fonte oficial do clube, competição, liga ou veículo claramente confiável. Diferencie no texto o que veio do feed estatístico e o que foi confirmação web. Nunca invente estatísticas, nunca preencha métrica ausente com chute, nunca trate rumor como fato e não mantenha pick ruim só porque a odd parece atraente.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                objective:
                  "Revisar picks pontuadas pelo motor estatístico, fazer a leitura principal do jogo, ajustar a probabilidade com parcimônia e devolver resumo, razões, alertas e seções de análise organizadas.",
                filters,
                picks,
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
