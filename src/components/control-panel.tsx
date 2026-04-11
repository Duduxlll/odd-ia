"use client";

import { useState } from "react";

import {
  ArrowRight,
  ChevronDown,
  Radar,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import {
  cn,
  getScanDateLabelLower,
  getTodayDateInSaoPaulo,
  getTomorrowDateInSaoPaulo,
} from "@/lib/utils";
import type {
  AnalysisFilters,
  ConfigStatus,
  MarketCategoryId,
  SupportedLeague,
  SupportedMarketCategory,
} from "@/lib/types";

type ControlPanelDiagnostics = {
  scanDate: string;
  totalRemainingInWindow: number;
  selectedRemainingInWindow: number;
  missingSelectedLeagues: SupportedLeague[];
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-12 w-full rounded-xl px-4 text-sm text-white outline-none transition-colors focus:border-[#22D3EE]";

const inputStyle = {
  backgroundColor: "#0a1020",
  border: "1px solid #1e2d42",
};

function SectionToggle({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-all"
      style={
        active
          ? {
              backgroundColor: "rgba(34,211,238,0.14)",
              border: "1px solid rgba(34,211,238,0.30)",
              color: "#22D3EE",
            }
          : {
              backgroundColor: "#111a2c",
              border: "1px solid #1e2d42",
              color: "#94A3B8",
            }
      }
    >
      <span>{label}</span>
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={
          active
            ? { backgroundColor: "rgba(34,211,238,0.20)", color: "#22D3EE" }
            : { backgroundColor: "#1a2840", color: "#64748B" }
        }
      >
        {value}
      </span>
      <ChevronDown
        className={cn("h-4 w-4 transition-transform", active ? "rotate-180" : "")}
      />
    </button>
  );
}

export function ControlPanel({
  config,
  filters,
  leagues,
  regulatedBookmakerCount,
  markets,
  isPending,
  isClearing,
  onRun,
  onClear,
  onChange,
  onToggleLeague,
  onToggleMarket,
  diagnostics,
}: {
  config: ConfigStatus;
  filters: AnalysisFilters;
  leagues: SupportedLeague[];
  regulatedBookmakerCount: number;
  markets: SupportedMarketCategory[];
  isPending: boolean;
  isClearing: boolean;
  onRun: () => void;
  onClear: () => void;
  onChange: (value: AnalysisFilters) => void;
  onToggleLeague: (id: number) => void;
  onToggleMarket: (id: MarketCategoryId) => void;
  diagnostics: ControlPanelDiagnostics;
}) {
  const [showLeagues, setShowLeagues] = useState(false);
  const [showMarkets, setShowMarkets] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [leagueQuery, setLeagueQuery] = useState("");
  const today = getTodayDateInSaoPaulo();
  const tomorrow = getTomorrowDateInSaoPaulo();
  const selectedWindow = filters.scanDate === tomorrow ? "tomorrow" : "today";
  const scanDateLabelLower = getScanDateLabelLower(diagnostics.scanDate);
  const topLeagueIds = leagues.slice(0, 8).map((league) => league.id);
  const normalizedLeagueQuery = leagueQuery.trim().toLowerCase();
  const visibleLeagues = normalizedLeagueQuery
    ? leagues.filter((league) =>
        `${league.name} ${league.country}`.toLowerCase().includes(normalizedLeagueQuery),
      )
    : leagues;

  return (
    <motion.aside
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      className="rounded-[32px] p-5"
      style={{
        backgroundColor: "#0C1424",
        border: "1px solid #1a2840",
        boxShadow: "0 28px 80px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Console do scan</p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-white">
            Ajuste sem bagunça
          </h2>
        </div>
        <div
          className="rounded-2xl p-3"
          style={{
            backgroundColor: "rgba(34,211,238,0.10)",
            border: "1px solid rgba(34,211,238,0.20)",
          }}
        >
          <SlidersHorizontal className="h-4 w-4 text-[#22D3EE]" />
        </div>
      </div>

      {/* Summary pills */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {[
          filters.leagueIds.length
            ? `${filters.leagueIds.length} ligas prioritárias`
            : "todas as ligas",
          `${regulatedBookmakerCount} casas reguladas`,
          `${filters.marketCategories.length} mercados`,
          `faixa ${filters.minOdd.toFixed(2)}-${filters.maxOdd.toFixed(2)}`,
        ].map((label) => (
          <span
            key={label}
            className="rounded-full px-3 py-1 text-[10px] uppercase tracking-widest text-slate-400"
            style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Fields */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Data base">
          <input
            type="date"
            value={filters.scanDate}
            readOnly
            disabled
            className={inputClass}
            style={{ ...inputStyle, color: "#94A3B8", opacity: 0.9 }}
          />
        </Field>
        <Field label="Janela">
          <select
            value={selectedWindow}
            onChange={(event) =>
              onChange({
                ...filters,
                scanDate: event.target.value === "tomorrow" ? tomorrow : today,
                horizonHours: 24,
              })
            }
            className={inputClass}
            style={inputStyle}
          >
            <option value="today">Hoje até 23:59</option>
            <option value="tomorrow">Amanhã (00:00-23:59)</option>
          </select>
        </Field>
        <Field label="Odd mínima">
          <input
            type="number"
            step="0.01"
            value={filters.minOdd}
            onChange={(event) => onChange({ ...filters, minOdd: Number(event.target.value) })}
            className={inputClass}
            style={inputStyle}
          />
        </Field>
        <Field label="Odd máxima">
          <input
            type="number"
            step="0.01"
            value={filters.maxOdd}
            onChange={(event) => onChange({ ...filters, maxOdd: Number(event.target.value) })}
            className={inputClass}
            style={inputStyle}
          />
        </Field>
        <Field label="Volume de picks">
          <select
            value={String(filters.pickCount)}
            onChange={(event) =>
              onChange({ ...filters, pickCount: Number(event.target.value) })
            }
            className={inputClass}
            style={inputStyle}
          >
            <option value="5">5 picks</option>
            <option value="10">10 picks</option>
            <option value="15">15 picks</option>
            <option value="20">20 picks</option>
          </select>
        </Field>
        <Field label="Odd alvo da múltipla">
          <input
            type="number"
            step="0.1"
            value={filters.targetAccumulatorOdd}
            onChange={(event) =>
              onChange({ ...filters, targetAccumulatorOdd: Number(event.target.value) })
            }
            className={inputClass}
            style={inputStyle}
          />
        </Field>
      </div>

      <div
        className="mt-4 rounded-2xl px-4 py-3 text-xs leading-6"
        style={{
          backgroundColor:
            diagnostics.selectedRemainingInWindow > 0
              ? "rgba(34,211,238,0.08)"
              : "rgba(251,191,36,0.08)",
          border:
            diagnostics.selectedRemainingInWindow > 0
              ? "1px solid rgba(34,211,238,0.20)"
              : "1px solid rgba(251,191,36,0.20)",
          color: diagnostics.selectedRemainingInWindow > 0 ? "#67E8F9" : "#FCD34D",
        }}
      >
        {diagnostics.selectedRemainingInWindow > 0 ? (
          <>
            Restam <strong>{diagnostics.selectedRemainingInWindow}</strong> jogos futuros em{" "}
            {scanDateLabelLower} no seu escopo atual e{" "}
            <strong>{diagnostics.totalRemainingInWindow}</strong> no total desse recorte.
          </>
        ) : diagnostics.totalRemainingInWindow > 0 ? (
          <>
            Nessas ligas não há partidas futuras em {scanDateLabelLower}. Ainda existem{" "}
            <strong>{diagnostics.totalRemainingInWindow}</strong> jogos no total desse recorte.
            {diagnostics.missingSelectedLeagues.length ? (
              <>
                {" "}Sem jogos futuros agora em:{" "}
                {diagnostics.missingSelectedLeagues
                  .slice(0, 4)
                  .map((league) => league.name)
                  .join(", ")}
                .
              </>
            ) : null}
          </>
        ) : (
          <>Não restam partidas futuras em {scanDateLabelLower}. O radar zera antes de buscar odds.</>
        )}
      </div>

      {/* Section toggles */}
      <div className="mt-5 flex flex-wrap gap-2">
        <SectionToggle
          label="Ligas prioritárias"
          value={filters.leagueIds.length ? String(filters.leagueIds.length) : "Todas"}
          active={showLeagues}
          onClick={() => setShowLeagues((c) => !c)}
        />
        <SectionToggle
          label="Mercados"
          value={String(filters.marketCategories.length)}
          active={showMarkets}
          onClick={() => setShowMarkets((c) => !c)}
        />
        <SectionToggle
          label="Avançado"
          value="2"
          active={showAdvanced}
          onClick={() => setShowAdvanced((c) => !c)}
        />
      </div>

      {/* Leagues */}
      <AnimatePresence initial={false}>
        {showLeagues ? (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            className="overflow-hidden"
          >
            <div
              className="mt-4 rounded-2xl p-4"
              style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Ligas prioritárias
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, leagueIds: [] })}
                  className="rounded-full px-3 py-2 text-sm font-medium transition-all"
                  style={
                    filters.leagueIds.length === 0
                      ? {
                          backgroundColor: "rgba(34,211,238,0.16)",
                          border: "1px solid rgba(34,211,238,0.32)",
                          color: "#22D3EE",
                        }
                      : {
                          backgroundColor: "#0a1020",
                          border: "1px solid #1e2d42",
                          color: "#94A3B8",
                        }
                  }
                >
                  Todas as ligas
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, leagueIds: topLeagueIds })}
                  className="rounded-full px-3 py-2 text-sm font-medium transition-all"
                  style={
                    filters.leagueIds.length > 0 &&
                    filters.leagueIds.length === topLeagueIds.length &&
                    topLeagueIds.every((leagueId) => filters.leagueIds.includes(leagueId))
                      ? {
                          backgroundColor: "rgba(34,211,238,0.16)",
                          border: "1px solid rgba(34,211,238,0.32)",
                          color: "#22D3EE",
                        }
                      : {
                          backgroundColor: "#0a1020",
                          border: "1px solid #1e2d42",
                          color: "#94A3B8",
                        }
                  }
                >
                  Só prioritárias
                </button>
              </div>
              <div className="mt-3">
                <input
                  type="search"
                  value={leagueQuery}
                  onChange={(event) => setLeagueQuery(event.target.value)}
                  placeholder="Buscar liga ou país"
                  className={cn(inputClass, "h-11")}
                  style={inputStyle}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {filters.leagueIds.length === 0
                  ? `Modo aberto: o scan pode puxar qualquer uma das ${leagues.length} ligas disponíveis.`
                  : "As ligas marcadas entram com prioridade no radar. Se você limpar tudo, o sistema abre o mapa completo."}
              </p>
              <div className="mt-3 max-h-[22rem] overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-2">
                  {visibleLeagues.map((league) => {
                    const selected =
                      filters.leagueIds.length === 0 || filters.leagueIds.includes(league.id);
                    const emphasized = topLeagueIds.includes(league.id);
                    return (
                      <button
                        key={league.id}
                        type="button"
                        onClick={() => onToggleLeague(league.id)}
                        className="rounded-2xl px-3 py-2 text-left text-sm font-medium transition-all"
                        style={
                          selected
                            ? {
                                backgroundColor: "rgba(34,211,238,0.16)",
                                border: "1px solid rgba(34,211,238,0.32)",
                              color: "#22D3EE",
                            }
                          : {
                              backgroundColor: "#0a1020",
                              border: "1px solid #1e2d42",
                              color: "#94A3B8",
                            }
                        }
                      >
                        <span className="block text-sm">{league.name}</span>
                        <span className="mt-0.5 block text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {league.country}
                          {emphasized ? " • prioridade" : ""}
                        </span>
                      </button>
                    );
                  })}
                  {!visibleLeagues.length ? (
                    <div
                      className="w-full rounded-2xl px-3 py-4 text-sm text-slate-500"
                      style={{ backgroundColor: "#0a1020", border: "1px solid #1e2d42" }}
                    >
                      Nenhuma liga encontrada para essa busca.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Markets */}
      <AnimatePresence initial={false}>
        {showMarkets ? (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            className="overflow-hidden"
          >
            <div
              className="mt-4 rounded-2xl p-4"
              style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Famílias de mercado
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {markets.map((market) => {
                  const selected = filters.marketCategories.includes(market.id);
                  return (
                    <button
                      key={market.id}
                      type="button"
                      onClick={() => onToggleMarket(market.id)}
                      className="rounded-2xl p-3.5 text-left transition-all"
                      style={
                        selected
                          ? {
                              backgroundColor: "rgba(34,211,238,0.10)",
                              border: "1px solid rgba(34,211,238,0.25)",
                            }
                          : {
                              backgroundColor: "#0a1020",
                              border: "1px solid #1e2d42",
                            }
                      }
                    >
                      <p
                        className="text-sm font-semibold"
                        style={{ color: selected ? "#22D3EE" : "#F1F5F9" }}
                      >
                        {market.label}
                      </p>
                      <p className="mt-1.5 text-xs leading-5 text-slate-500">
                        {market.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Advanced */}
      <AnimatePresence initial={false}>
        {showAdvanced ? (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            className="overflow-hidden"
          >
            <div
              className="mt-4 flex flex-col gap-3 rounded-2xl p-4"
              style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
            >
              <div
                className="rounded-xl px-3 py-2.5 text-xs leading-5"
                style={
                  config.apiFootballPlanMode === "free"
                    ? {
                        backgroundColor: "rgba(34,211,238,0.08)",
                        border: "1px solid rgba(34,211,238,0.18)",
                        color: "#22D3EE",
                      }
                    : {
                        backgroundColor: "rgba(52,211,153,0.08)",
                        border: "1px solid rgba(52,211,153,0.18)",
                        color: "#34D399",
                      }
                }
              >
                {config.apiFootballPlanMode === "free"
                  ? "Plano grátis: varredura mais curta para respeitar rate limit."
                  : "Plano Pro ativo: scan profundo ampliado e shortlist maior."}
              </div>

              <div
                className="rounded-xl px-3 py-2.5 text-xs leading-5 text-slate-400"
                style={{ backgroundColor: "#0a1020", border: "1px solid #1e2d42" }}
              >
                {config.singleBookmakerMode ? (
                  <>
                    Odds focadas em{" "}
                    <strong className="text-white">{config.primaryBookmakerName}</strong>.
                  </>
                ) : (
                  <>
                    Odds comparadas automaticamente entre{" "}
                    <strong className="text-white">{regulatedBookmakerCount} casas reguladas</strong>.
                  </>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={filters.useWebSearch}
                  onChange={(event) =>
                    onChange({ ...filters, useWebSearch: event.target.checked })
                  }
                  className="mt-1 h-4 w-4 rounded accent-[#22D3EE]"
                />
                <span className="text-slate-400">
                  <strong className="block text-slate-200">Permitir busca web da IA</strong>
                  A IA pode checar notícia recente e contexto final.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={filters.includeSameGame}
                  onChange={(event) =>
                    onChange({ ...filters, includeSameGame: event.target.checked })
                  }
                  className="mt-1 h-4 w-4 rounded accent-[#22D3EE]"
                />
                <span className="text-slate-400">
                  <strong className="block text-slate-200">Permitir same game</strong>
                  Se desligado, a múltipla evita repetir fixture.
                </span>
              </label>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Buttons */}
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <button
          type="button"
          onClick={onRun}
          disabled={isPending || isClearing}
          className="inline-flex h-[52px] w-full items-center justify-center gap-3 rounded-2xl text-sm font-bold tracking-[-0.01em] transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #22D3EE 0%, #0EA5E9 100%)",
            color: "#060A14",
            boxShadow: isPending
              ? "none"
              : "0 0 28px rgba(34,211,238,0.35), 0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          {isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Radar className="h-4 w-4" />
          )}
          {isPending ? "Escaneando..." : "Rodar análise"}
          {!isPending && <ArrowRight className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={isPending || isClearing}
          className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-2xl px-5 text-sm font-medium text-slate-400 transition-all hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: "#111a2c",
            border: "1px solid #1e2d42",
          }}
        >
          {isClearing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          {isClearing ? "Limpando..." : "Limpar"}
        </button>
      </div>
    </motion.aside>
  );
}
