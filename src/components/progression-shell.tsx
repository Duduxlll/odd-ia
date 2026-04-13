"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  History,
  Loader2,
  Lock,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react";

import type { ProgressionDay, ProgressionSession } from "@/lib/types";

type Props = {
  initialActive: ProgressionSession | null;
  initialHistory: ProgressionSession[];
};

const ODD_MIN = 1.5;
const ODD_MAX = 1.6;

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(status: ProgressionDay["status"]) {
  switch (status) {
    case "won": return "Green ✓";
    case "lost": return "Red ✗";
    case "open": return "Aberto";
    case "analyzing": return "Analisando...";
    default: return "Pendente";
  }
}

function statusColors(status: ProgressionDay["status"]) {
  switch (status) {
    case "won": return { bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.30)", text: "#4ade80" };
    case "lost": return { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.30)", text: "#f87171" };
    case "open": return { bg: "rgba(34,211,238,0.08)", border: "rgba(34,211,238,0.35)", text: "#22d3ee" };
    case "analyzing": return { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.30)", text: "#fbbf24" };
    default: return { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", text: "#64748b" };
  }
}

// ─── Start Screen ──────────────────────────────────────────────────────────

function StartScreen({ onStart }: { onStart: (amount: number) => Promise<void> }) {
  const [amount, setAmount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(",", "."));
    if (!parsed || parsed < 1) { setError("Valor mínimo: R$1,00"); return; }
    setLoading(true);
    setError(null);
    try { await onStart(parsed); } catch (err) { setError(err instanceof Error ? err.message : "Erro."); setLoading(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(99,102,241,0.2) 100%)", border: "1px solid rgba(34,211,238,0.3)" }}>
            <TrendingUp className="h-8 w-8 text-cyan-400" />
          </div>
          <h1 className="font-display text-3xl text-white">Progressão</h1>
          <p className="mt-2 text-sm text-slate-500">
            Odd alvo: {ODD_MIN}–{ODD_MAX} · Máximo esforço de IA
          </p>
        </div>

        <div className="rounded-3xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                Valor inicial (BRL)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl py-3 pl-9 pr-4 text-white outline-none focus:ring-1"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
                  placeholder="10.00"
                />
              </div>
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)", color: "#060A14" }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Criando sessão..." : "Iniciar progressão"}
            </button>
          </form>

          <div className="mt-4 rounded-xl p-3" style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.12)" }}>
            <p className="text-[11px] leading-5 text-slate-500">
              A cada dia a IA encontra a melhor aposta com odd entre {ODD_MIN} e {ODD_MAX}.
              O retorno de cada dia vira a entrada do próximo.
              Se der red, a sessão fecha e você começa uma nova.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Day Row ───────────────────────────────────────────────────────────────

function DayRow({
  day,
  isNextDay,
  onOpen,
  onSettle,
}: {
  day: ProgressionDay;
  isNextDay: boolean;
  onOpen: (dayNumber: number, stake: number) => Promise<void>;
  onSettle: (dayNumber: number, force?: "won" | "lost") => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const colors = statusColors(day.status);

  async function handleOpen() {
    setLoading(true);
    try { await onOpen(day.dayNumber, day.stake); } finally { setLoading(false); }
  }

  async function handleCheck() {
    setLoading(true);
    try { await onSettle(day.dayNumber); } finally { setLoading(false); }
  }

  const isLocked = !isNextDay && day.status === "pending";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      <button
        type="button"
        onClick={() => !isLocked && setExpanded((v) => !v)}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
      >
        {/* Day number */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
          style={{ background: "rgba(255,255,255,0.05)", color: colors.text }}>
          {day.dayNumber}
        </div>

        {/* Stake */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white">{formatBRL(day.stake)}</span>
            {day.actualOdd && (
              <span className="text-xs text-slate-500">× {day.actualOdd.toFixed(2)}</span>
            )}
          </div>
          {day.returnAmount && (
            <span className="text-xs" style={{ color: colors.text }}>
              → {formatBRL(day.returnAmount)}
            </span>
          )}
        </div>

        {/* Status badge */}
        <div className="shrink-0 flex items-center gap-2">
          {day.status === "analyzing" && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />}
          {day.status === "won" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
          {day.status === "lost" && <XCircle className="h-4 w-4 text-rose-400" />}
          {isLocked && <Lock className="h-3.5 w-3.5 text-slate-600" />}
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: colors.text }}>
            {statusLabel(day.status)}
          </span>
          {!isLocked && <ChevronRight className={`h-3.5 w-3.5 text-slate-600 transition-transform ${expanded ? "rotate-90" : ""}`} />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-3 border-t" style={{ borderColor: colors.border }}>

              {/* Pick info */}
              {day.pick && (
                <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Aposta selecionada</p>
                  <p className="text-sm font-semibold text-white">{day.pick.fixtureLabel}</p>
                  <p className="text-xs text-slate-400">{day.pick.marketName} · <span style={{ color: colors.text }}>{day.pick.selection}</span></p>
                  <div className="mt-2 flex gap-3 text-xs text-slate-500">
                    <span>Odd: <strong className="text-white">{day.actualOdd?.toFixed(2)}</strong></span>
                    <span>Liga: {day.pick.leagueName}</span>
                  </div>
                  {day.pick.summary && (
                    <p className="mt-2 text-[11px] leading-5 text-slate-500 line-clamp-3">{day.pick.summary}</p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {/* Open day (analyze) */}
                {isNextDay && day.status === "pending" && (
                  <button
                    type="button"
                    onClick={handleOpen}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(99,102,241,0.15) 100%)", border: "1px solid rgba(34,211,238,0.35)", color: "#22d3ee" }}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {loading ? "Analisando..." : "Analisar dia " + day.dayNumber}
                  </button>
                )}

                {/* Check result */}
                {day.status === "open" && (
                  <>
                    <button
                      type="button"
                      onClick={handleCheck}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-60"
                      style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.25)", color: "#22d3ee" }}
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                      Verificar resultado
                    </button>
                    <button type="button" onClick={() => onSettle(day.dayNumber, "won")} disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all disabled:opacity-60"
                      style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.28)", color: "#4ade80" }}>
                      <CheckCircle2 className="h-4 w-4" /> Green
                    </button>
                    <button type="button" onClick={() => onSettle(day.dayNumber, "lost")} disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all disabled:opacity-60"
                      style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.28)", color: "#f87171" }}>
                      <XCircle className="h-4 w-4" /> Red
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── History Card ──────────────────────────────────────────────────────────

function HistoryCard({ session }: { session: ProgressionSession }) {
  const wonDays = session.days.filter((d) => d.status === "won").length;
  const lastReturn = session.days.filter((d) => d.returnAmount).at(-1)?.returnAmount ?? session.startAmount;
  const isWon = session.status === "won";

  return (
    <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {isWon
        ? <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
        : <XCircle className="h-4 w-4 shrink-0 text-rose-400" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">
          {formatBRL(session.startAmount)} → {formatBRL(lastReturn)}
        </p>
        <p className="text-[11px] text-slate-500">
          {wonDays} dia{wonDays !== 1 ? "s" : ""} acertado{wonDays !== 1 ? "s" : ""} ·{" "}
          {new Date(session.startedAt).toLocaleDateString("pt-BR")}
        </p>
      </div>
      <span className="text-[11px] font-bold uppercase tracking-widest"
        style={{ color: isWon ? "#4ade80" : "#f87171" }}>
        {isWon ? "Win" : "Loss"}
      </span>
    </div>
  );
}

// ─── Main Shell ────────────────────────────────────────────────────────────

export function ProgressionShell({ initialActive, initialHistory }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<ProgressionSession | null>(initialActive);
  const [history, setHistory] = useState<ProgressionSession[]>(initialHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [resetting, setResetting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll while any day is analyzing
  const needsPoll = active?.days.some((d) => d.status === "analyzing") ?? false;

  const refresh = useCallback(async () => {
    const res = await fetch("/api/progression");
    if (!res.ok) return;
    const data = (await res.json()) as { active: ProgressionSession | null; history: ProgressionSession[] };
    setActive(data.active);
    setHistory(data.history);
  }, []);

  useEffect(() => {
    if (needsPoll) {
      pollRef.current = setInterval(refresh, 5000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [needsPoll, refresh]);

  async function handleStart(amount: number) {
    const res = await fetch("/api/progression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startAmount: amount }),
    });
    const data = await res.json() as { session?: ProgressionSession; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Erro ao criar sessão.");
    if (data.session) setActive({ ...data.session, days: [{ id: crypto.randomUUID(), sessionId: data.session.id, dayNumber: 1, stake: amount, oddMin: ODD_MIN, oddMax: ODD_MAX, actualOdd: null, returnAmount: null, fixtureId: null, pick: null, status: "pending", openedAt: null, settledAt: null }] });
  }

  async function handleOpen(dayNumber: number, stake: number) {
    if (!active) return;
    const res = await fetch("/api/progression/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: active.id, dayNumber, stake }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Erro ao analisar.");
    await refresh();
  }

  async function handleSettle(dayNumber: number, force?: "won" | "lost") {
    if (!active) return;
    const res = await fetch("/api/progression/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: active.id, dayNumber, forceResult: force }),
    });
    const data = await res.json() as { result?: "won" | "lost"; status?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Erro.");

    await refresh();

    // After settling won, add next pending day
    if (data.result === "won") {
      await refresh();
    }
  }

  async function handleReset() {
    if (!active || resetting) return;
    setResetting(true);
    try {
      const res = await fetch("/api/progression/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: active.id }),
      });
      const data = await res.json() as { session?: ProgressionSession; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro.");
      await refresh();
    } finally {
      setResetting(false);
    }
  }

  // Build the visible days list: all settled + current open/analyzing + next pending
  const visibleDays = (() => {
    if (!active) return [];
    const days = [...active.days].sort((a, b) => a.dayNumber - b.dayNumber);
    const lastDay = days.at(-1);
    if (!lastDay) return [];

    // If last day is won, inject next pending day
    if (lastDay.status === "won") {
      const nextStake = lastDay.returnAmount ?? lastDay.stake;
      days.push({
        id: `next-${lastDay.dayNumber + 1}`,
        sessionId: active.id,
        dayNumber: lastDay.dayNumber + 1,
        stake: nextStake,
        oddMin: ODD_MIN,
        oddMax: ODD_MAX,
        actualOdd: null,
        returnAmount: null,
        fixtureId: null,
        pick: null,
        status: "pending",
        openedAt: null,
        settledAt: null,
      });
    }

    return days;
  })();

  const nextDayNumber = visibleDays.find((d) => d.status === "pending")?.dayNumber ?? null;

  if (!active) {
    return <StartScreen onStart={handleStart} />;
  }

  const totalReturn = visibleDays.filter((d) => d.returnAmount).at(-1)?.returnAmount ?? active.startAmount;
  const wonCount = visibleDays.filter((d) => d.status === "won").length;

  return (
    <div className="min-h-screen px-3 py-6 sm:px-6 xl:px-10">
      {/* Header */}
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <button type="button" onClick={() => router.push("/")}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/5"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <ArrowLeft className="h-4 w-4 text-slate-400" />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-xl text-white">Progressão</h1>
            <p className="text-xs text-slate-500">Odd {ODD_MIN}–{ODD_MAX} · Máximo esforço</p>
          </div>
          <button type="button" onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:text-white"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <History className="h-3.5 w-3.5" />
            Histórico
          </button>
        </div>

        {/* Stats bar */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { label: "Entrada inicial", value: formatBRL(active.startAmount) },
            { label: "Dias acertados", value: String(wonCount) },
            { label: "Retorno atual", value: formatBRL(totalReturn) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl p-3 text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{stat.label}</p>
              <p className="mt-1 text-base font-semibold text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* History panel */}
        <AnimatePresence>
          {showHistory && history.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-5"
            >
              <div className="rounded-2xl p-3 flex flex-col gap-2"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">Sessões anteriores</p>
                {history.filter((s) => s.id !== active.id).map((s) => (
                  <HistoryCard key={s.id} session={s} />
                ))}
                {history.filter((s) => s.id !== active.id).length === 0 && (
                  <p className="text-xs text-slate-600 px-1">Nenhuma sessão anterior.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Days list */}
        <div className="flex flex-col gap-2">
          {visibleDays.map((day) => (
            <DayRow
              key={day.id}
              day={day}
              isNextDay={day.dayNumber === nextDayNumber}
              onOpen={handleOpen}
              onSettle={handleSettle}
            />
          ))}
        </div>

        {/* Analyzing notice */}
        {needsPoll && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 rounded-2xl p-4 flex items-center gap-3"
            style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.22)" }}
          >
            <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
            <p className="text-sm text-amber-300">
              A IA está trabalhando no máximo para encontrar a melhor aposta. Aguarde 5–15 min.
            </p>
          </motion.div>
        )}

        {/* Reset button */}
        {active.status === "active" && (
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={handleReset} disabled={resetting}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-slate-600 transition-colors hover:text-rose-400 disabled:opacity-60"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Resetar sessão
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
