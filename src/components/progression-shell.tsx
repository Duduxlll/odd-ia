"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  History,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react";

import { MARKET_RULES, TOP_FOOTBALL_LEAGUES } from "@/lib/constants";
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
    case "won":      return { bg: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.30)",   text: "#4ade80" };
    case "lost":     return { bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.30)",   text: "#f87171" };
    case "open":     return { bg: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.35)",  text: "#22d3ee" };
    case "analyzing":return { bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.30)",  text: "#fbbf24" };
    default:         return { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", text: "#64748b" };
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
    try { await onStart(parsed); }
    catch (err) { setError(err instanceof Error ? err.message : "Erro."); setLoading(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm"
      >
        {/* Back link */}
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-300">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao radar
        </Link>

        <div className="mb-8 text-center">
          <div
            className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.18) 0%, rgba(99,102,241,0.18) 100%)", border: "1px solid rgba(34,211,238,0.28)" }}
          >
            <TrendingUp className="h-8 w-8 text-cyan-400" />
          </div>
          <h1 className="font-display text-3xl text-white">Progressão</h1>
          <p className="mt-2 text-sm text-slate-500">Odd alvo: {ODD_MIN}–{ODD_MAX} · Máximo esforço de IA</p>
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
                  className="w-full rounded-xl py-3 pl-9 pr-4 text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
                  placeholder="10.00"
                  autoFocus
                />
              </div>
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)", color: "#060A14" }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Criando sessão..." : "Iniciar progressão"}
            </button>
          </form>

          <div className="mt-4 rounded-xl p-3" style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.10)" }}>
            <p className="text-[11px] leading-5 text-slate-500">
              Cada dia a IA busca a melhor aposta com odd entre {ODD_MIN} e {ODD_MAX}.
              O retorno vira a entrada do próximo dia. Se der red, reseta e começa de novo.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Priority leagues — PL, La Liga, Serie A, Bundesliga, Brasileirão
const DEFAULT_LEAGUE_IDS = [39, 140, 135, 78, 71];

type LeagueCountEntry = { id: number; name: string; country: string; count: number };

// ─── Day Row ───────────────────────────────────────────────────────────────

function DayRow({
  day,
  isNextDay,
  onOpen,
  onSettle,
}: {
  day: ProgressionDay;
  isNextDay: boolean;
  onOpen: (dayNumber: number, stake: number, leagueIds: number[], marketCategories: string[]) => Promise<void>;
  onSettle: (dayNumber: number, force?: "won" | "lost") => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(day.status === "open" || (isNextDay && day.status === "pending"));
  const [loading, setLoading] = useState(false);
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<number[]>(DEFAULT_LEAGUE_IDS);
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>(["result", "goals"]);
  const [leagueEntries, setLeagueEntries] = useState<LeagueCountEntry[]>([]);
  const leaguesLoadedRef = useRef(false);

  const colors = statusColors(day.status);
  const isLocked = !isNextDay && day.status === "pending";
  const prevStatusRef = useRef(day.status);

  // Auto-expand when analysis finishes and pick arrives
  useEffect(() => {
    if (prevStatusRef.current === "analyzing" && day.status === "open") {
      setExpanded(true);
    }
    prevStatusRef.current = day.status;
  }, [day.status]);

  // Load league fixture counts once when this day's selector panel is visible
  useEffect(() => {
    if (!isNextDay || day.status !== "pending" || !expanded || leaguesLoadedRef.current) return;
    leaguesLoadedRef.current = true;
    fetch("/api/progression/fixtures", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { leagues?: LeagueCountEntry[] }) => {
        if (data.leagues) setLeagueEntries(data.leagues);
      })
      .catch(() => null);
  }, [isNextDay, day.status, expanded]);

  async function handleOpen() {
    setLoading(true);
    try { await onOpen(day.dayNumber, day.stake, selectedLeagueIds, selectedMarketIds); } finally { setLoading(false); }
  }

  async function handleSettle(force?: "won" | "lost") {
    setLoading(true);
    try { await onSettle(day.dayNumber, force); } finally { setLoading(false); }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      {/* Row header — always visible */}
      <button
        type="button"
        onClick={() => !isLocked && setExpanded((v) => !v)}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
        disabled={isLocked}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
          style={{ background: "rgba(255,255,255,0.05)", color: colors.text }}
        >
          {day.dayNumber}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white">{formatBRL(day.stake)}</span>
            {day.actualOdd && <span className="text-xs text-slate-500">× {day.actualOdd.toFixed(2)}</span>}
          </div>
          {day.returnAmount && (
            <span className="text-xs" style={{ color: colors.text }}>→ {formatBRL(day.returnAmount)}</span>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {day.status === "analyzing" && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />}
          {day.status === "won" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
          {day.status === "lost" && <XCircle className="h-4 w-4 text-rose-400" />}
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: colors.text }}>
            {statusLabel(day.status)}
          </span>
          {!isLocked && (
            <ChevronRight className={`h-3.5 w-3.5 text-slate-600 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-3 border-t" style={{ borderColor: colors.border }}>

              {/* Pick card */}
              {day.pick && (
                <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Aposta selecionada</p>
                  <p className="text-sm font-semibold text-white">{day.pick.fixtureLabel}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {day.pick.marketName} · <span style={{ color: colors.text }}>{day.pick.selection}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Odd: <strong className="text-white">{day.actualOdd?.toFixed(2)}</strong></span>
                    <span>Liga: {day.pick.leagueName}</span>
                    <span>Retorno: <strong className="text-white">{day.returnAmount ? formatBRL(day.returnAmount) : "—"}</strong></span>
                  </div>
                  {day.pick.summary && (
                    <p className="mt-2 text-[11px] leading-5 text-slate-500 line-clamp-4">{day.pick.summary}</p>
                  )}
                </div>
              )}

              {/* Selectors + Analyze — only on next pending day */}
              {isNextDay && (day.status === "pending" || day.status === "analyzing") && (
                <div className="mt-1 flex flex-col gap-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>

                  {/* League selector */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Ligas</p>
                      <div className="flex gap-3">
                        <button type="button" disabled={day.status === "analyzing"}
                          onClick={() => setSelectedLeagueIds(TOP_FOOTBALL_LEAGUES.map((l) => l.id))}
                          className="text-[10px] text-slate-600 transition-colors hover:text-cyan-400 disabled:cursor-not-allowed">
                          Todas
                        </button>
                        <button type="button" disabled={day.status === "analyzing"}
                          onClick={() => setSelectedLeagueIds(DEFAULT_LEAGUE_IDS)}
                          className="text-[10px] text-slate-600 transition-colors hover:text-cyan-400 disabled:cursor-not-allowed">
                          Prioritárias
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(leagueEntries.length > 0 ? leagueEntries : TOP_FOOTBALL_LEAGUES.map((l) => ({ ...l, count: undefined as number | undefined }))).map((league) => {
                        const isSelected = selectedLeagueIds.includes(league.id);
                        return (
                          <button
                            key={league.id}
                            type="button"
                            disabled={day.status === "analyzing"}
                            onClick={() => setSelectedLeagueIds((prev) =>
                              prev.includes(league.id) ? prev.filter((id) => id !== league.id) : [...prev, league.id]
                            )}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all disabled:cursor-not-allowed"
                            style={isSelected
                              ? { background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.35)", color: "#22d3ee" }
                              : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", color: "#475569" }}
                          >
                            <span>{league.name}</span>
                            {"count" in league && typeof league.count === "number" && (
                              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                                style={isSelected
                                  ? { background: "rgba(34,211,238,0.20)", color: "#22d3ee" }
                                  : { background: "rgba(255,255,255,0.06)", color: "#64748b" }}>
                                {league.count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Market selector */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Mercados</p>
                      <div className="flex gap-3">
                        <button type="button" disabled={day.status === "analyzing"}
                          onClick={() => setSelectedMarketIds(MARKET_RULES.map((m) => m.id))}
                          className="text-[10px] text-slate-600 transition-colors hover:text-indigo-400 disabled:cursor-not-allowed">
                          Todos
                        </button>
                        <button type="button" disabled={day.status === "analyzing"}
                          onClick={() => setSelectedMarketIds(["result", "goals"])}
                          className="text-[10px] text-slate-600 transition-colors hover:text-indigo-400 disabled:cursor-not-allowed">
                          Resetar
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {MARKET_RULES.map((market) => {
                        const isSelected = selectedMarketIds.includes(market.id);
                        return (
                          <button
                            key={market.id}
                            type="button"
                            disabled={day.status === "analyzing"}
                            onClick={() => setSelectedMarketIds((prev) =>
                              prev.includes(market.id) ? prev.filter((id) => id !== market.id) : [...prev, market.id]
                            )}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all disabled:cursor-not-allowed"
                            style={isSelected
                              ? { background: "rgba(99,102,241,0.16)", border: "1px solid rgba(99,102,241,0.40)", color: "#a5b4fc" }
                              : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", color: "#475569" }}
                          >
                            {market.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Analyze button */}
                  <button
                    type="button"
                    onClick={handleOpen}
                    disabled={loading || day.status === "analyzing" || selectedLeagueIds.length === 0 || selectedMarketIds.length === 0}
                    className="inline-flex items-center gap-2 self-start rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.14) 0%, rgba(99,102,241,0.14) 100%)", border: "1px solid rgba(34,211,238,0.32)", color: "#22d3ee" }}
                  >
                    {loading || day.status === "analyzing"
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Sparkles className="h-4 w-4" />}
                    {loading ? "Iniciando..." : day.status === "analyzing" ? "IA analisando..." : `Analisar dia ${day.dayNumber}`}
                  </button>
                </div>
              )}

              {/* Other action buttons */}
              <div className="flex flex-wrap gap-2 mt-1">

                {/* Settle buttons */}
                {day.status === "open" && (
                  <>
                    <button type="button" onClick={() => handleSettle()} disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                      style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.22)", color: "#22d3ee" }}>
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Verificar resultado
                    </button>
                    <button type="button" onClick={() => handleSettle("won")} disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                      style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.28)", color: "#4ade80" }}>
                      <CheckCircle2 className="h-4 w-4" /> Green
                    </button>
                    <button type="button" onClick={() => handleSettle("lost")} disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
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

  return (
    <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      {session.status === "won"
        ? <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
        : <XCircle className="h-4 w-4 shrink-0 text-rose-400" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{formatBRL(session.startAmount)} → {formatBRL(lastReturn)}</p>
        <p className="text-[11px] text-slate-500">
          {wonDays} dia{wonDays !== 1 ? "s" : ""} · {new Date(session.startedAt).toLocaleDateString("pt-BR")}
        </p>
      </div>
      <span className="text-[11px] font-bold uppercase tracking-widest"
        style={{ color: session.status === "won" ? "#4ade80" : "#f87171" }}>
        {session.status === "won" ? "Win" : "Loss"}
      </span>
    </div>
  );
}

// ─── Main Shell ────────────────────────────────────────────────────────────

export function ProgressionShell({ initialActive, initialHistory }: Props) {
  const [active, setActive] = useState<ProgressionSession | null>(initialActive);
  const [history, setHistory] = useState<ProgressionSession[]>(initialHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const needsPoll = active?.days.some((d) => d.status === "analyzing") ?? false;

  const refresh = useCallback(async () => {
    const res = await fetch("/api/progression", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { active: ProgressionSession | null; history: ProgressionSession[] };
    setActive(data.active);
    setHistory(data.history);
  }, []);

  useEffect(() => {
    if (needsPoll) {
      pollRef.current = setInterval(refresh, 5000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [needsPoll, refresh]);

  // ── Create session ────────────────────────────────────────────────────────
  async function handleStart(amount: number) {
    const res = await fetch("/api/progression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startAmount: amount }),
    });
    const data = (await res.json()) as { session?: ProgressionSession; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Erro ao criar sessão.");
    if (data.session) {
      const firstDay: ProgressionDay = {
        id: crypto.randomUUID(),
        sessionId: data.session.id,
        dayNumber: 1,
        stake: amount,
        oddMin: ODD_MIN,
        oddMax: ODD_MAX,
        actualOdd: null,
        returnAmount: null,
        fixtureId: null,
        pick: null,
        status: "pending",
        openedAt: null,
        settledAt: null,
      };
      setActive({ ...data.session, days: [firstDay] });
    }
  }

  // ── Open a day (trigger analysis) ────────────────────────────────────────
  async function handleOpen(dayNumber: number, stake: number, leagueIds: number[], marketCategories: string[]) {
    if (!active) return;
    const res = await fetch("/api/progression/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: active.id, dayNumber, stake, leagueIds, marketCategories }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Erro ao analisar.");
    await refresh();
  }

  // ── Settle a day ─────────────────────────────────────────────────────────
  async function handleSettle(dayNumber: number, force?: "won" | "lost") {
    if (!active) return;
    const res = await fetch("/api/progression/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: active.id, dayNumber, forceResult: force }),
    });
    const data = (await res.json()) as { result?: "won" | "lost"; status?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Erro.");
    await refresh();
  }

  // ── End session (keeps in history as loss) ────────────────────────────────
  async function handleReset() {
    if (!active || actionLoading) return;
    setActionLoading("reset");
    try {
      await fetch("/api/progression/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: active.id, mode: "end" }),
      });
      // Go back to start screen so user can enter new value
      setActive(null);
      await refresh();
    } finally {
      setActionLoading(null);
    }
  }

  // ── Delete session completely (limpar tabela) ─────────────────────────────
  async function handleClearTable() {
    if (!active || actionLoading) return;
    setActionLoading("clear");
    try {
      await fetch("/api/progression/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: active.id, mode: "delete" }),
      });
      setActive(null);
      await refresh();
    } finally {
      setActionLoading(null);
    }
  }

  // ── Clear history ─────────────────────────────────────────────────────────
  async function handleClearHistory() {
    if (clearingHistory) return;
    setClearingHistory(true);
    try {
      await fetch("/api/progression", { method: "DELETE" });
      await refresh();
      setShowHistory(false);
    } finally {
      setClearingHistory(false);
    }
  }

  // ── Build visible days list ────────────────────────────────────────────────
  const visibleDays = (() => {
    if (!active) return [];
    const days = [...active.days].sort((a, b) => a.dayNumber - b.dayNumber);

    // Always ensure at least day 1 is visible (even before any DB row exists)
    if (days.length === 0) {
      days.push({
        id: `day-1-pending`,
        sessionId: active.id,
        dayNumber: 1,
        stake: active.startAmount,
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

    const lastDay = days.at(-1)!;

    // After a win, inject the next pending day with the accumulated stake
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
  const wonCount = visibleDays.filter((d) => d.status === "won").length;
  const totalReturn = visibleDays.filter((d) => d.returnAmount).at(-1)?.returnAmount ?? (active?.startAmount ?? 0);
  const pastHistory = history.filter((s) => s.id !== active?.id);

  // ─────────────────────────────────────────────────────────────────────────
  if (!active) {
    return <StartScreen onStart={handleStart} />;
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
            <h1 className="font-display text-xl text-white">Progressão</h1>
            <p className="text-xs text-slate-500">Odd {ODD_MIN}–{ODD_MAX} · Máximo esforço</p>
          </div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:text-white"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <History className="h-3.5 w-3.5" />
            Histórico {pastHistory.length > 0 && `(${pastHistory.length})`}
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
              <p className="mt-1 text-sm font-semibold text-white sm:text-base">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* History panel */}
        <AnimatePresence initial={false}>
          {showHistory && (
            <motion.div
              key="history"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-5"
            >
              <div className="rounded-2xl p-3 flex flex-col gap-2"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center justify-between px-1 mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Sessões anteriores</p>
                  {pastHistory.length > 0 && (
                    <button type="button" onClick={handleClearHistory} disabled={clearingHistory}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-600 transition-colors hover:text-rose-400 disabled:opacity-50">
                      {clearingHistory ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Limpar histórico
                    </button>
                  )}
                </div>
                {pastHistory.length === 0
                  ? <p className="text-xs text-slate-600 px-1">Nenhuma sessão anterior.</p>
                  : pastHistory.map((s) => <HistoryCard key={s.id} session={s} />)
                }
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

        {/* Analyzing banner */}
        <AnimatePresence>
          {needsPoll && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="mt-4 rounded-2xl p-4 flex items-center gap-3"
              style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.20)" }}
            >
              <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
              <p className="text-sm text-amber-300">
                IA trabalhando no máximo — tentando até 4 varreduras para encontrar a odd ideal. Aguarde 5–20 min.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom actions */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleClearTable}
            disabled={!!actionLoading}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:text-rose-400 disabled:opacity-50"
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {actionLoading === "clear" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Limpar tabela
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={!!actionLoading}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-50"
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {actionLoading === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Resetar sessão
          </button>
        </div>
      </div>
    </div>
  );
}
