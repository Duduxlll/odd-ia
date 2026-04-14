"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Layers,
  Loader2,
  Search,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";

import type { AccumulatorSuggestion } from "@/lib/types";
import type { AccumuladoraFixturesResponse, AccumuladoraFixture, AccumuladoraLeague } from "@/app/api/acumuladora/fixtures/route";

// ─── Market options ─────────────────────────────────────────────────────────

const MARKET_OPTIONS = [
  { id: "result", label: "Resultado" },
  { id: "goals", label: "Gols" },
  { id: "halves", label: "Tempos" },
  { id: "handicaps", label: "Handicaps" },
  { id: "corners", label: "Escanteios" },
  { id: "cards", label: "Cartões" },
  { id: "shots", label: "Chutes" },
  { id: "stats", label: "Estatísticas" },
  { id: "players", label: "Jogador" },
  { id: "team_totals", label: "Totais de time" },
] as const;

type MarketId = (typeof MARKET_OPTIONS)[number]["id"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatKickoff(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
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

function ResultCard({ acc, stake }: { acc: AccumulatorSuggestion; stake: number }) {
  const reached = acc.combinedOdd >= acc.targetOdd;
  const returnAmount = stake * acc.combinedOdd;

  return (
    <div className="flex flex-col gap-4">
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

// ─── League Selector ────────────────────────────────────────────────────────

function LeagueSelector({
  leagues,
  selected,
  onChange,
}: {
  leagues: AccumuladoraLeague[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return leagues;
    return leagues.filter(
      (l) => l.name.toLowerCase().includes(q) || l.country.toLowerCase().includes(q),
    );
  }, [leagues, query]);

  const allSelected = selected.length === 0;

  function toggle(id: number) {
    if (selected.includes(id)) {
      const next = selected.filter((x) => x !== id);
      onChange(next);
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Ligas</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] font-semibold"
            style={{ color: allSelected ? "#22d3ee" : "#475569" }}
          >
            Todas
          </button>
          <span className="text-[10px] text-slate-700">·</span>
          <button
            type="button"
            onClick={() => onChange(leagues.map((l) => l.id))}
            className="text-[10px] font-semibold text-slate-600"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
        <input
          type="text"
          placeholder="Buscar liga..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl py-2 pl-8 pr-3 text-xs text-white outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
        />
      </div>

      {/* List */}
      <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: 180 }}>
        {filtered.length === 0 && (
          <p className="py-3 text-center text-xs text-slate-600">Nenhuma liga encontrada</p>
        )}
        {filtered.map((league) => {
          const isSelected = allSelected || selected.includes(league.id);
          return (
            <button
              key={league.id}
              type="button"
              onClick={() => toggle(league.id)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors"
              style={
                selected.includes(league.id)
                  ? { background: "rgba(34,211,238,0.10)" }
                  : { background: "transparent" }
              }
            >
              <div
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded"
                style={
                  selected.includes(league.id)
                    ? { background: "#22d3ee" }
                    : { border: "1px solid rgba(255,255,255,0.20)" }
                }
              >
                {selected.includes(league.id) && (
                  <svg className="h-2 w-2 text-slate-900" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                )}
              </div>
              <span className={`flex-1 text-xs truncate ${isSelected ? "text-white" : "text-slate-500"}`}>
                {league.name}
              </span>
              <span className="text-[10px] text-slate-600">{league.country}</span>
              <span
                className="ml-1 rounded px-1 py-0.5 text-[10px] font-bold"
                style={{ background: "rgba(255,255,255,0.06)", color: "#64748b" }}
              >
                {league.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fixture Selector ────────────────────────────────────────────────────────

function FixtureSelector({
  fixtures,
  selected,
  onChange,
}: {
  fixtures: AccumuladoraFixture[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return fixtures;
    return fixtures.filter(
      (f) =>
        f.homeTeam.toLowerCase().includes(q) ||
        f.awayTeam.toLowerCase().includes(q) ||
        f.leagueName.toLowerCase().includes(q),
    );
  }, [fixtures, query]);

  function toggle(id: number) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
          Jogos {selected.length > 0 && <span style={{ color: "#22d3ee" }}>· {selected.length} selecionados</span>}
        </p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] font-semibold text-slate-600"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
        <input
          type="text"
          placeholder="Buscar time ou liga..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl py-2 pl-8 pr-3 text-xs text-white outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
        />
      </div>

      {/* List */}
      <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: 200 }}>
        {filtered.length === 0 && (
          <p className="py-3 text-center text-xs text-slate-600">
            {fixtures.length === 0 ? "Nenhum jogo disponível" : "Nenhum jogo encontrado"}
          </p>
        )}
        {filtered.map((fixture) => {
          const isSelected = selected.includes(fixture.id);
          return (
            <button
              key={fixture.id}
              type="button"
              onClick={() => toggle(fixture.id)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors"
              style={isSelected ? { background: "rgba(34,211,238,0.08)" } : { background: "transparent" }}
            >
              <div
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded"
                style={
                  isSelected
                    ? { background: "#22d3ee" }
                    : { border: "1px solid rgba(255,255,255,0.20)" }
                }
              >
                {isSelected && (
                  <svg className="h-2 w-2 text-slate-900" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold truncate ${isSelected ? "text-white" : "text-slate-400"}`}>
                  {fixture.homeTeam} <span className="text-slate-600">vs</span> {fixture.awayTeam}
                </p>
                <p className="text-[10px] text-slate-600 truncate">{fixture.leagueName} · {fixture.leagueCountry}</p>
              </div>
              <span className="shrink-0 text-[10px] text-slate-600">{formatKickoff(fixture.kickoff)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Market Selector ─────────────────────────────────────────────────────────

function MarketSelector({
  selected,
  onChange,
}: {
  selected: MarketId[];
  onChange: (ids: MarketId[]) => void;
}) {
  function toggle(id: MarketId) {
    if (selected.includes(id)) {
      if (selected.length === 1) return; // keep at least one
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Mercados</p>
        <button
          type="button"
          onClick={() => onChange(MARKET_OPTIONS.map((m) => m.id))}
          className="text-[10px] font-semibold text-slate-600"
        >
          Todos
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {MARKET_OPTIONS.map((m) => {
          const active = selected.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
              style={
                active
                  ? {
                      background: "rgba(34,211,238,0.15)",
                      border: "1px solid rgba(34,211,238,0.38)",
                      color: "#22d3ee",
                    }
                  : {
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      color: "#475569",
                    }
              }
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Shell ────────────────────────────────────────────────────────────

const PRESET_TARGETS = [40, 100, 200, 500, 1000];
const DEFAULT_MARKETS: MarketId[] = ["result", "goals", "halves", "handicaps"];

export function AcumuladoraShell() {
  const [targetOdd, setTargetOdd] = useState(200);
  const [stakeInput, setStakeInput] = useState("10");
  const [scanDate, setScanDate] = useState<"today" | "tomorrow">("today");
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<number[]>([]);
  const [selectedFixtureIds, setSelectedFixtureIds] = useState<number[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<MarketId[]>(DEFAULT_MARKETS);
  const [loading, setLoading] = useState(false);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [fixturesData, setFixturesData] = useState<AccumuladoraFixturesResponse | null>(null);
  const [result, setResult] = useState<AccumulatorSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stake = parseFloat(stakeInput.replace(",", ".")) || 10;

  // Load fixtures on mount
  useEffect(() => {
    setLoadingFixtures(true);
    fetch("/api/acumuladora/fixtures")
      .then((r) => r.json())
      .then((data: AccumuladoraFixturesResponse) => setFixturesData(data))
      .catch(() => {})
      .finally(() => setLoadingFixtures(false));
  }, []);

  // Current day data
  const dayData = fixturesData?.[scanDate];
  const allLeagues: AccumuladoraLeague[] = dayData?.leagues ?? [];
  const allFixtures: AccumuladoraFixture[] = dayData?.fixtures ?? [];

  // Filter fixtures by selected leagues
  const visibleFixtures = useMemo(() => {
    if (selectedLeagueIds.length === 0) return allFixtures;
    return allFixtures.filter((f) => selectedLeagueIds.includes(f.leagueId));
  }, [allFixtures, selectedLeagueIds]);

  // When date changes, clear fixture selection
  function handleDateChange(d: "today" | "tomorrow") {
    setScanDate(d);
    setSelectedFixtureIds([]);
    setSelectedLeagueIds([]);
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/acumuladora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetOdd,
          scanDate,
          leagueIds: selectedLeagueIds,
          fixtureIds: selectedFixtureIds,
          marketCategories: selectedMarkets,
        }),
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
          className="mb-5 rounded-3xl p-5 flex flex-col gap-5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {/* Odd target presets */}
          <div>
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

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* Date toggle */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">Data</p>
            <div className="flex gap-2">
              {(["today", "tomorrow"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDateChange(d)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold transition-all"
                  style={
                    scanDate === d
                      ? {
                          background: "rgba(34,211,238,0.15)",
                          border: "1px solid rgba(34,211,238,0.38)",
                          color: "#22d3ee",
                        }
                      : {
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.09)",
                          color: "#475569",
                        }
                  }
                >
                  {d === "today" ? "Hoje" : "Amanhã"}
                  {fixturesData && (
                    <span className="ml-1.5 text-[10px] opacity-60">
                      {fixturesData[d].fixtures.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* League selector */}
          {loadingFixtures ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" />
              <span className="text-xs text-slate-600">Carregando ligas...</span>
            </div>
          ) : (
            <LeagueSelector
              leagues={allLeagues}
              selected={selectedLeagueIds}
              onChange={(ids) => {
                setSelectedLeagueIds(ids);
                // Clear fixtures that are no longer visible
                if (ids.length > 0) {
                  setSelectedFixtureIds((prev) =>
                    prev.filter((fid) =>
                      allFixtures.find((f) => f.id === fid && ids.includes(f.leagueId)),
                    ),
                  );
                }
              }}
            />
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* Fixture selector */}
          <FixtureSelector
            fixtures={visibleFixtures}
            selected={selectedFixtureIds}
            onChange={setSelectedFixtureIds}
          />

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* Market selector */}
          <MarketSelector selected={selectedMarkets} onChange={setSelectedMarkets} />

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* Stake input */}
          <div>
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

          <p className="text-center text-[11px] text-slate-600">
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
