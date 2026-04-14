"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Layers,
  Loader2,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";

import type { AccumulatorSuggestion } from "@/lib/types";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Leg Card ──────────────────────────────────────────────────────────────

function LegCard({ pick, index }: { pick: AccumulatorSuggestion["picks"][number]; index: number }) {
  const verdictColor =
    pick.aiVerdict === "strong_yes"
      ? "#4ade80"
      : pick.aiVerdict === "yes"
        ? "#a3e635"
        : pick.aiVerdict === "pass"
          ? "#f87171"
          : "#94a3b8";

  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-start gap-3">
        {/* Leg number */}
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
          style={{ background: "rgba(34,211,238,0.10)", color: "#22d3ee" }}
        >
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{pick.fixtureLabel}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {pick.marketName} ·{" "}
            <span className="text-slate-300">{pick.selection}</span>
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5">{pick.leagueName} · {pick.leagueCountry}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold" style={{ color: "#22d3ee" }}>
            {pick.bestOdd.toFixed(2)}×
          </p>
          <p className="text-[10px] mt-0.5 font-semibold uppercase tracking-widest" style={{ color: verdictColor }}>
            {pick.aiVerdict === "strong_yes"
              ? "Forte"
              : pick.aiVerdict === "yes"
                ? "Sim"
                : pick.aiVerdict === "lean_yes"
                  ? "Leve"
                  : "Pass"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Result Card ───────────────────────────────────────────────────────────

function ResultCard({
  acc,
  stake,
}: {
  acc: AccumulatorSuggestion;
  stake: number;
}) {
  const reached = acc.combinedOdd >= acc.targetOdd;
  const returnAmount = stake * acc.combinedOdd;

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Odd combinada", value: `${acc.combinedOdd.toFixed(1)}×` },
          { label: "Pernas", value: String(acc.picks.length) },
          { label: "Confiança média", value: `${acc.confidence}%` },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl p-3 text-center"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{s.label}</p>
            <p className="mt-1 text-sm font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Target reached / not reached banner */}
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={
          reached
            ? { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }
            : { background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.22)" }
        }
      >
        {reached ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
        ) : (
          <TrendingUp className="h-4 w-4 shrink-0 text-amber-400" />
        )}
        <p className="text-sm" style={{ color: reached ? "#4ade80" : "#fbbf24" }}>
          {acc.rationale}
        </p>
      </div>

      {/* Return calculator */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.14)" }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">
          Simulador de retorno · Bet365
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-slate-500">Apostando R$ {stake.toLocaleString("pt-BR")}</span>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <span className="text-lg font-bold text-white">{formatBRL(returnAmount)}</span>
        </div>
      </div>

      {/* Leg list */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
          Pernas da múltipla
        </p>
        <div className="flex flex-col gap-2">
          {acc.picks.map((pick, i) => (
            <LegCard key={pick.candidateId} pick={pick} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Shell ────────────────────────────────────────────────────────────

const PRESET_TARGETS = [40, 100, 200, 500, 1000];

export function AcumuladoraShell() {
  const [targetOdd, setTargetOdd] = useState(200);
  const [stakeInput, setStakeInput] = useState("10");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AccumulatorSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stake = parseFloat(stakeInput.replace(",", ".")) || 10;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/acumuladora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOdd }),
      });
      const data = (await res.json()) as { accumulator?: AccumulatorSuggestion; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar múltipla.");
      setResult(data.accumulator ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-3 py-6 sm:px-6 xl:px-10">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/5"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <ArrowLeft className="h-4 w-4 text-slate-400" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-xl text-white">Múltipla Bet365</h1>
            <p className="text-xs text-slate-500">Picks exclusivos da Bet365 · Odd alvo configurável</p>
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.22)" }}
          >
            <Layers className="h-4 w-4 text-cyan-400" />
          </div>
        </div>

        {/* Config card */}
        <div
          className="mb-5 rounded-3xl p-5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {/* Odd target presets */}
          <div className="mb-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
              Odd alvo · atual: {targetOdd}×
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_TARGETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTargetOdd(t)}
                  className="rounded-xl px-3.5 py-2 text-sm font-semibold transition-all"
                  style={
                    targetOdd === t
                      ? {
                          background: "linear-gradient(135deg, rgba(34,211,238,0.18) 0%, rgba(99,102,241,0.18) 100%)",
                          border: "1px solid rgba(34,211,238,0.40)",
                          color: "#22d3ee",
                        }
                      : {
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.09)",
                          color: "#475569",
                        }
                  }
                >
                  {t}×
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="mt-3 flex items-center gap-2">
              <input
                type="range"
                min={40}
                max={1000}
                step={10}
                value={targetOdd}
                onChange={(e) => setTargetOdd(Number(e.target.value))}
                className="flex-1 accent-cyan-400"
              />
              <div
                className="flex w-20 items-center justify-center rounded-xl px-2 py-2"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
              >
                <span className="text-sm font-bold text-cyan-400">{targetOdd}×</span>
              </div>
            </div>
          </div>

          {/* Stake input */}
          <div className="mb-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
              Valor da aposta (simulação)
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
              <input
                type="number"
                min="1"
                step="1"
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                className="w-full rounded-xl py-2.5 pl-9 pr-4 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
              />
            </div>
            {stake > 0 && !loading && result && (
              <p className="mt-1.5 text-xs text-slate-500">
                Retorno potencial:{" "}
                <strong className="text-white">{formatBRL(stake * result.combinedOdd)}</strong>
              </p>
            )}
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)", color: "#060A14" }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando Bet365... aguarde 5–20 min
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Gerar múltipla {targetOdd}×
              </>
            )}
          </button>

          <p className="mt-2 text-center text-[11px] text-slate-600">
            Picks exclusivos da Bet365 · Máximo esforço de análise
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}
          >
            <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && <ResultCard acc={result} stake={stake} />}

      </div>
    </div>
  );
}
