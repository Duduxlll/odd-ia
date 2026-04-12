"use client";

import { useState } from "react";

import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import type { AnalysisPick } from "@/lib/types";
import { cn, formatDateTimeInSaoPaulo, formatOdd, formatPercent } from "@/lib/utils";

function categoryLabel(category: AnalysisPick["marketCategory"]) {
  if (category === "goals") return "Gols no jogo";
  if (category === "result") return "Resultado da partida";
  if (category === "corners") return "Escanteios no jogo";
  if (category === "cards") return "Cartões no jogo";
  if (category === "shots") return "Chutes no jogo";
  if (category === "stats") return "Estatísticas do jogo";
  if (category === "halves") return "Por tempo";
  if (category === "team_totals") return "Total por equipe";
  if (category === "handicaps") return "Handicap";
  if (category === "players") return "Props de jogador";
  return "Mercado especial";
}

function categoryAccent(category: AnalysisPick["marketCategory"]) {
  if (category === "goals") return { color: "#22D3EE", bg: "rgba(34,211,238,0.12)", border: "rgba(34,211,238,0.25)" };
  if (category === "result") return { color: "#A78BFA", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.25)" };
  if (category === "corners") return { color: "#FBBF24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.25)" };
  if (category === "cards") return { color: "#FB7185", bg: "rgba(251,113,133,0.12)", border: "rgba(251,113,133,0.25)" };
  if (category === "shots") return { color: "#34D399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" };
  if (category === "stats") return { color: "#818CF8", bg: "rgba(129,140,248,0.12)", border: "rgba(129,140,248,0.25)" };
  if (category === "team_totals") return { color: "#38BDF8", bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.25)" };
  if (category === "handicaps") return { color: "#F472B6", bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.25)" };
  return { color: "#60A5FA", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.25)" };
}

function verdictStyle(verdict: AnalysisPick["aiVerdict"]) {
  if (verdict === "strong_yes") return { color: "#34D399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" };
  if (verdict === "yes") return { color: "#22D3EE", bg: "rgba(34,211,238,0.12)", border: "rgba(34,211,238,0.25)" };
  if (verdict === "lean_yes") return { color: "#FBBF24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.25)" };
  return { color: "#FB7185", bg: "rgba(251,113,133,0.12)", border: "rgba(251,113,133,0.25)" };
}

function confidenceGradient(value: number) {
  if (value >= 80) return "from-emerald-400 to-teal-400";
  if (value >= 68) return "from-cyan-400 to-sky-400";
  if (value >= 56) return "from-amber-400 to-orange-400";
  return "from-rose-400 to-red-400";
}

function confidenceGlow(value: number) {
  if (value >= 80) return "rgba(52,211,153,0.45)";
  if (value >= 68) return "rgba(34,211,238,0.45)";
  if (value >= 56) return "rgba(251,191,36,0.40)";
  return "rgba(251,113,133,0.40)";
}

function formatSigned(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  const fixed = value.toFixed(2);
  return value > 0 ? `+${fixed}` : fixed;
}

function lineTrendLabel(trend: NonNullable<AnalysisPick["lineMovement"]>["trend"]) {
  if (trend === "steam") return "Steam";
  if (trend === "drift") return "Drift";
  if (trend === "flat") return "Estável";
  return "Nova";
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ backgroundColor: "#0a1020", border: "1px solid #1a2840" }}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ToggleButton({
  label,
  count,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: typeof BadgeCheck;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all"
      style={
        active
          ? {
              backgroundColor: "#1a2840",
              border: "1px solid #2d4060",
              color: "#F1F5F9",
            }
          : {
              backgroundColor: "#111a2c",
              border: "1px solid #1e2d42",
              color: "#64748B",
            }
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={
          active
            ? { backgroundColor: "#243456", color: "#94A3B8" }
            : { backgroundColor: "#0a1020", color: "#475569" }
        }
      >
        {count}
      </span>
      <ChevronDown
        className={cn("h-4 w-4 transition-transform", active ? "rotate-180" : "")}
      />
    </button>
  );
}

export function PickCard({
  pick,
  index,
  singleBookmakerMode,
  bookmakerUrl,
}: {
  pick: AnalysisPick;
  index: number;
  singleBookmakerMode: boolean;
  bookmakerUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [showCautions, setShowCautions] = useState(false);
  const [favorInsight, setFavorInsight] = useState<string | null>(null);
  const [cautionInsight, setCautionInsight] = useState<string | null>(null);
  const [isLoadingFavor, setIsLoadingFavor] = useState(false);
  const [isLoadingCaution, setIsLoadingCaution] = useState(false);
  const [showDossier, setShowDossier] = useState(false);

  const accent = categoryAccent(pick.marketCategory);
  const verdict = verdictStyle(pick.aiVerdict);
  const diagnostics = [
    pick.xgContext?.combinedProjection !== null && pick.xgContext?.combinedProjection !== undefined
      ? {
          label: "xG",
          value: formatOdd(pick.xgContext.combinedProjection),
          detail:
            pick.xgContext.source === "feed"
              ? "feed direto"
              : pick.xgContext.source === "mixed"
                ? "feed + estim."
                : "estimativa",
        }
      : null,
    pick.lineMovement
      ? {
          label: "Linha",
          value: lineTrendLabel(pick.lineMovement.trend),
          detail:
            pick.lineMovement.deltaFromOpen !== null
              ? `${formatOdd(pick.lineMovement.openingOdd ?? pick.lineMovement.currentOdd)} → ${formatOdd(pick.lineMovement.currentOdd)}`
              : "1ª captura",
        }
      : null,
    pick.clv
      ? {
          label: "CLV",
          value:
            pick.clv.status === "pending"
              ? "Pendente"
              : pick.clv.status === "unavailable"
                ? "Sem dado"
                : formatSigned(pick.clv.delta),
          detail:
            pick.clv.closingOdd !== null
              ? `fechou ${formatOdd(pick.clv.closingOdd)}`
              : "fecha no kickoff",
        }
      : null,
    pick.refereeStats && (pick.marketCategory === "cards" || pick.marketName === "Total de cartoes")
      ? {
          label: "Árbitro",
          value:
            pick.refereeStats.yellowAvg !== null
              ? `${pick.refereeStats.yellowAvg.toFixed(1)} YC`
              : "—",
          detail: `${pick.refereeStats.samples} amostras`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; detail: string }>;

  async function handleCopy() {
    const content = [
      `${pick.fixtureLabel}`,
      `${pick.marketName} | ${pick.selection}`,
      `Feed: ${pick.rawMarketName} | ${pick.rawSelectionValue}${pick.rawHandicap ? ` | linha ${pick.rawHandicap}` : ""}`,
      `Odd ${formatOdd(pick.bestOdd)} | Casa ${pick.bookmaker}`,
      `Resumo: ${pick.summary}`,
    ].join("\n");

    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function handleInsight(direction: "favor" | "caution") {
    const setLoading = direction === "favor" ? setIsLoadingFavor : setIsLoadingCaution;
    const setInsight = direction === "favor" ? setFavorInsight : setCautionInsight;

    setLoading(true);
    try {
      const response = await fetch("/api/analyze/pick-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          pick: {
            candidateId: pick.candidateId,
            fixtureLabel: pick.fixtureLabel,
            homeTeam: pick.homeTeam,
            awayTeam: pick.awayTeam,
            leagueName: pick.leagueName,
            marketName: pick.marketName,
            marketCategory: pick.marketCategory,
            selection: pick.selection,
            bestOdd: pick.bestOdd,
            modelProbability: pick.modelProbability,
            confidence: pick.confidence,
            reasons: pick.reasons,
            cautions: pick.cautions,
            analysisSections: pick.analysisSections,
            summary: pick.summary,
          },
        }),
      });
      const data = (await response.json()) as { analysis?: string; error?: string };
      if (!response.ok || !data.analysis) {
        throw new Error(data.error ?? "Não foi possível gerar análise agora.");
      }
      setInsight(data.analysis);
    } catch (err) {
      setInsight(err instanceof Error ? `Erro: ${err.message}` : "Erro ao gerar análise.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035 }}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="flex overflow-hidden rounded-[28px]"
      style={{
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        border: "1px solid #1a2840",
      }}
    >
      {/* Accent left bar */}
      <div
        className="w-[3px] flex-shrink-0"
        style={{ backgroundColor: accent.color }}
      />

      {/* Content */}
      <div
        className="min-w-0 flex-1 p-4 sm:p-5"
        style={{ backgroundColor: "#0C1424" }}
      >
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{
              backgroundColor: accent.bg,
              border: `1px solid ${accent.border}`,
              color: accent.color,
            }}
          >
            {pick.marketName}
          </span>
          <span
            className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{
              backgroundColor: verdict.bg,
              border: `1px solid ${verdict.border}`,
              color: verdict.color,
            }}
          >
            {pick.aiConfidenceLabel}
          </span>
        </div>

        {/* Main info + metrics block */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold tracking-[-0.03em] text-white sm:text-lg xl:text-xl">
              {pick.selection}
            </h3>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">
              {categoryLabel(pick.marketCategory)} · {pick.marketName}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {pick.fixtureLabel} · {formatDateTimeInSaoPaulo(pick.fixtureDate)}
            </p>
            <p className="mt-0.5 break-words text-[10px] leading-5 text-slate-600">
              Nome técnico: {pick.rawMarketName} · {pick.rawSelectionValue}
              {pick.rawHandicap ? ` · linha ${pick.rawHandicap}` : ""}
            </p>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">{pick.summary}</p>
          </div>

          {/* Confidence + metrics */}
          <div
            className="w-full shrink-0 rounded-2xl p-4 sm:w-[200px]"
            style={{ backgroundColor: "#070d1a", border: "1px solid #1a2840" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Confiança
              </span>
              <span className="text-[11px] font-semibold text-slate-300">
                {pick.confidence.toFixed(0)}/100
              </span>
            </div>
            <div
              className="mt-2.5 h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: "#1a2840" }}
            >
              <motion.div
                className={cn("h-full rounded-full bg-gradient-to-r", confidenceGradient(pick.confidence))}
                initial={{ width: 0 }}
                animate={{ width: `${pick.confidence}%` }}
                transition={{ delay: index * 0.035 + 0.25, duration: 0.55, ease: "easeOut" }}
                style={{ boxShadow: `0 0 10px ${confidenceGlow(pick.confidence)}` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MetricTile label="Odd" value={formatOdd(pick.bestOdd)} />
              <MetricTile label="Justa" value={formatOdd(pick.fairOdd)} />
              <MetricTile label="Prob." value={formatPercent(pick.modelProbability)} />
              <MetricTile label="Edge" value={formatPercent(pick.edge)} />
            </div>
          </div>
        </div>

        {/* Info pills */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {[
            `Melhor odd: ${pick.bookmaker}`,
            `${pick.sportsbookCount} books`,
            `Pulse: ${pick.predictionPulse}`,
          ].map((label) => (
            <span
              key={label}
              className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-500"
              style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
            >
              {label}
            </span>
          ))}
        </div>

        {diagnostics.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {diagnostics.map((item) => (
              <div
                key={`${pick.candidateId}:${item.label}`}
                className="rounded-xl px-3 py-2.5"
                style={{ backgroundColor: "#0a1020", border: "1px solid #17253b" }}
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">{item.value}</p>
                <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Toggle actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <ToggleButton
            label="A favor"
            count={pick.reasons.length}
            icon={BadgeCheck}
            active={showReasons}
            onClick={() => setShowReasons((c) => !c)}
          />
          <ToggleButton
            label="Tomar Cuidado"
            count={pick.cautions.length + (pick.newsNote ? 1 : 0)}
            icon={AlertTriangle}
            active={showCautions}
            onClick={() => setShowCautions((c) => !c)}
          />
          <ToggleButton
            label="Dossiê"
            count={pick.analysisSections.length}
            icon={FileText}
            active={showDossier}
            onClick={() => setShowDossier((c) => !c)}
          />
          {singleBookmakerMode ? (
            <a
              href={bookmakerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-slate-400 transition-colors hover:text-slate-200"
              style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
            >
              <ExternalLink className="h-4 w-4" />
              Abrir casa
            </a>
          ) : null}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all"
            style={
              copied
                ? {
                    backgroundColor: "rgba(52,211,153,0.12)",
                    border: "1px solid rgba(52,211,153,0.25)",
                    color: "#34D399",
                  }
                : {
                    backgroundColor: "#111a2c",
                    border: "1px solid #1e2d42",
                    color: "#64748B",
                  }
            }
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>

        {/* Expandable: Reasons */}
        <AnimatePresence initial={false}>
          {showReasons ? (
            <motion.div
              key="reasons"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className="mt-4 rounded-2xl p-4"
                style={{
                  backgroundColor: "rgba(52,211,153,0.06)",
                  border: "1px solid rgba(52,211,153,0.18)",
                }}
              >
                {favorInsight ? (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                        Por que vai bater
                      </p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">
                      {favorInsight}
                    </p>
                    <button
                      type="button"
                      onClick={() => setFavorInsight(null)}
                      className="mt-4 text-[11px] text-slate-600 underline hover:text-slate-400"
                    >
                      Gerar nova análise
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                        A favor
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">
                      A IA vai analisar especificamente por que essa aposta tem chance de bater, com base nos dados reais do jogo.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleInsight("favor")}
                      disabled={isLoadingFavor}
                      className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-wait disabled:opacity-60"
                      style={{
                        backgroundColor: "rgba(52,211,153,0.14)",
                        border: "1px solid rgba(52,211,153,0.30)",
                        color: "#34D399",
                      }}
                    >
                      {isLoadingFavor ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {isLoadingFavor ? "Analisando... aguarde 1-2 min" : "Analisar por que vai bater"}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Expandable: Cautions */}
        <AnimatePresence initial={false}>
          {showCautions ? (
            <motion.div
              key="cautions"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className="mt-4 rounded-2xl p-4"
                style={{
                  backgroundColor: "rgba(251,113,133,0.07)",
                  border: "1px solid rgba(251,113,133,0.28)",
                }}
              >
                {cautionInsight ? (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-rose-400" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">
                        Por que pode falhar
                      </p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">
                      {cautionInsight}
                    </p>
                    <button
                      type="button"
                      onClick={() => setCautionInsight(null)}
                      className="mt-4 text-[11px] text-slate-600 underline hover:text-slate-400"
                    >
                      Gerar nova análise
                    </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start gap-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-rose-400" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">
                          Tomar Cuidado
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">
                        A IA vai analisar os riscos e por que essa aposta pode não bater, com base nos dados reais do jogo.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleInsight("caution")}
                        disabled={isLoadingCaution}
                        className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-wait disabled:opacity-60"
                        style={{
                          backgroundColor: "rgba(251,113,133,0.12)",
                          border: "1px solid rgba(251,113,133,0.28)",
                          color: "#FB7185",
                        }}
                      >
                        {isLoadingCaution ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                        {isLoadingCaution ? "Analisando... aguarde 1-2 min" : "Analisar por que pode falhar"}
                      </button>
                    </div>
                  )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Expandable: Dossier */}
        <AnimatePresence initial={false}>
          {showDossier ? (
            <motion.div
              key="dossier"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {pick.analysisSections.map((section) => (
                  <div
                    key={`${pick.candidateId}:${section.id}`}
                    className="rounded-2xl p-4"
                    style={
                      section.tone === "support"
                        ? {
                            backgroundColor: "rgba(52,211,153,0.06)",
                            border: "1px solid rgba(52,211,153,0.16)",
                          }
                        : section.tone === "caution"
                          ? {
                              backgroundColor: "rgba(251,191,36,0.06)",
                              border: "1px solid rgba(251,191,36,0.16)",
                            }
                          : {
                              backgroundColor: "#111a2c",
                              border: "1px solid #1e2d42",
                            }
                    }
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      {section.label}
                    </p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                      {section.bullets.map((bullet) => (
                        <p key={bullet}>· {bullet}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
