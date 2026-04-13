"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgePercent,
  Copy,
  ExternalLink,
  Flame,
  Gauge,
  LogOut,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";

import { ControlPanel } from "@/components/control-panel";
import { HeroPanel } from "@/components/hero-panel";
import { PanelCard } from "@/components/panel-card";
import { PickCard } from "@/components/pick-card";
import { normalizeAnalysisFilters } from "@/lib/constants";
import type {
  AnalysisFilters,
  AnalysisJob,
  AnalysisRun,
  DashboardSnapshot,
  MarketCategoryId,
  SupportedLeague,
} from "@/lib/types";
import {
  formatDateTimeInSaoPaulo,
  formatOdd,
  formatPercent,
  getScanDateLabel,
  getScanDateLabelLower,
} from "@/lib/utils";

export function DashboardShell({
  initialSnapshot,
  currentUsername,
}: {
  initialSnapshot: DashboardSnapshot;
  currentUsername: string;
}) {
  const router = useRouter();
  const initialFilters = normalizeAnalysisFilters(
    initialSnapshot.activeJob?.filters ??
      initialSnapshot.draftFilters ??
      initialSnapshot.latestRun?.filters ??
      initialSnapshot.defaultFilters,
  );
  const [filters, setFilters] = useState<AnalysisFilters>(initialFilters);
  const [run, setRun] = useState<AnalysisRun | null>(initialSnapshot.latestRun);
  const [activeJob, setActiveJob] = useState<AnalysisJob | null>(initialSnapshot.activeJob);
  const [error, setError] = useState<string | null>(null);
  const [systemNote, setSystemNote] = useState<string | null>(
    initialSnapshot.latestRun?.systemNote ?? null,
  );
  const [isSubmittingAnalysis, setIsSubmittingAnalysis] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isActiveJobPending = activeJob?.status === "queued" || activeJob?.status === "running";
  const isAnalyzing = isSubmittingAnalysis || isActiveJobPending;
  const currentDiagnostics = useMemo(
    () =>
      buildScanDiagnostics(
        initialSnapshot.scanFixtures,
        initialSnapshot.supportedLeagues,
        filters.scanDate,
        filters.leagueIds,
        nowMs,
      ),
    [filters.leagueIds, filters.scanDate, initialSnapshot.scanFixtures, initialSnapshot.supportedLeagues, nowMs],
  );
  const runDiagnostics = useMemo(
    () =>
      buildScanDiagnostics(
        initialSnapshot.scanFixtures,
        initialSnapshot.supportedLeagues,
        run?.filters.scanDate ?? filters.scanDate,
        run?.filters.leagueIds ?? filters.leagueIds,
        nowMs,
      ),
    [
      filters.leagueIds,
      filters.scanDate,
      initialSnapshot.scanFixtures,
      initialSnapshot.supportedLeagues,
      nowMs,
      run?.filters.leagueIds,
      run?.filters.scanDate,
    ],
  );
  const timeoutByVolume = Boolean(error && /timeout por volume|tempo limite da vercel/i.test(error));
  const noFixtureMessage = getNoFixtureMessage(currentDiagnostics, filters.leagueIds.length > 0);
  const resultDiagnosis = getResultDiagnosis(
    run,
    runDiagnostics,
    (run?.filters.leagueIds ?? []).length > 0,
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        await fetch("/api/analyze", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(filters),
          signal: controller.signal,
        });
      } catch {
        // draft sync is best-effort
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [filters]);

  useEffect(() => {
    if (!isActiveJobPending) {
      if (activeJob?.status === "failed" && activeJob.error) {
        setError(activeJob.error);
      }
      return;
    }

    let cancelled = false;

    async function pollState() {
      try {
        const response = await fetch("/api/analyze", {
          cache: "no-store",
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          // Server temporarily unavailable (deploy in progress), skip this poll silently
          return;
        }
        const payload = (await response.json()) as {
          activeJob?: AnalysisJob | null;
          draftFilters?: AnalysisFilters;
          error?: string;
          latestRun?: AnalysisRun | null;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Falha ao atualizar o status do scan.");
        }

        if (cancelled) {
          return;
        }

        setActiveJob(payload.activeJob ?? null);

        if (payload.latestRun) {
          setRun(payload.latestRun);
          setSystemNote(payload.latestRun.systemNote);
        }

        if (payload.activeJob?.status === "running" || payload.activeJob?.status === "queued") {
          setFilters(normalizeAnalysisFilters(payload.activeJob.filters));
          setError(null);
        } else if (payload.draftFilters) {
          setFilters(normalizeAnalysisFilters(payload.draftFilters));
        }

        if (payload.activeJob?.status === "failed") {
          setError(payload.activeJob.error || "A análise falhou antes de concluir.");
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Falha ao atualizar o status do scan.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsSubmittingAnalysis(false);
        }
      }
    }

    pollState();
    const interval = window.setInterval(pollState, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeJob?.error, activeJob?.id, activeJob?.status, isActiveJobPending]);

  async function handleAnalyze() {
    setError(null);
    setCopyFeedback(null);
    setIsSubmittingAnalysis(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      const payload = (await response.json()) as { job?: AnalysisJob; error?: string };
      if (!response.ok || !payload.job) {
        throw new Error(payload.error || "Falha ao executar a análise.");
      }
      setActiveJob(payload.job);
      setSystemNote(
        payload.job.status === "queued"
          ? "Job enfileirado. O worker vai assumir o scan em instantes."
          : "Scan em andamento. Você pode atualizar a página que o processo continua.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Falha ao executar a análise.",
      );
      setIsSubmittingAnalysis(false);
    }
  }

  async function handleForceRestart() {
    setError(null);
    setCopyFeedback(null);
    setIsRestarting(true);
    try {
      await fetch("/api/analyze?force=true", { method: "DELETE" });
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("Servidor reiniciando. Aguarde 1-2 minutos e tente novamente.");
      }
      const payload = (await response.json()) as { job?: AnalysisJob; error?: string };
      if (!response.ok || !payload.job) {
        throw new Error(payload.error || "Falha ao reiniciar a análise.");
      }
      setRun(null);
      setActiveJob(payload.job);
      setSystemNote("Scan reiniciado. O radar vai processar do zero.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Falha ao reiniciar a análise.",
      );
    } finally {
      setIsRestarting(false);
    }
  }

  async function handleClear() {
    setError(null);
    setCopyFeedback(null);
    setIsClearing(true);
    try {
      const response = await fetch("/api/analyze", { method: "DELETE" });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        filters?: AnalysisFilters;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Falha ao limpar a análise.");
      }
      setRun(null);
      setActiveJob(null);
      setFilters(normalizeAnalysisFilters(payload.filters ?? initialSnapshot.defaultFilters));
      setSystemNote(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Falha ao limpar a análise.",
      );
    } finally {
      setIsClearing(false);
    }
  }

  async function handleCopyAccumulator() {
    if (!run?.accumulator) return;
    const content = [
      `Multipla sugerida - ${
        initialSnapshot.config.singleBookmakerMode
          ? initialSnapshot.config.primaryBookmakerName
          : "casas reguladas"
      }`,
      ...run.accumulator.picks.map(
        (pick, index) =>
          `${index + 1}. ${pick.fixtureLabel} | ${pick.marketName} | ${pick.selection} | Feed ${pick.rawMarketName} / ${pick.rawSelectionValue}${pick.rawHandicap ? ` / ${pick.rawHandicap}` : ""} | Odd ${formatOdd(pick.bestOdd)} | Casa ${pick.bookmaker}`,
      ),
      `Odd combinada: ${formatOdd(run.accumulator.combinedOdd)}`,
    ].join("\n");
    await navigator.clipboard.writeText(content);
    setCopyFeedback("Múltipla copiada.");
    window.setTimeout(() => setCopyFeedback(null), 1800);
  }

  async function handleLogout() {
    setError(null);
    setCopyFeedback(null);
    setIsLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Falha ao encerrar a sessão.");
      }
      router.push("/login");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Falha ao encerrar a sessão.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  function toggleLeague(id: number) {
    setFilters((current) => ({
      ...current,
      leagueIds: current.leagueIds.includes(id)
        ? current.leagueIds.filter((leagueId) => leagueId !== id)
        : [...current.leagueIds, id],
    }));
  }

  function toggleMarket(id: MarketCategoryId) {
    setFilters((current) => ({
      ...current,
      marketCategories: current.marketCategories.includes(id)
        ? current.marketCategories.filter((marketId) => marketId !== id)
        : [...current.marketCategories, id],
    }));
  }

  const picks = run?.picks ?? [];

  return (
    <div
      className="relative min-h-screen px-3 py-4 sm:px-5 sm:py-5 lg:px-8 xl:px-10"
      style={{ backgroundColor: "#060A14" }}
    >
      <div className="relative mx-auto flex w-full max-w-[1560px] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-300"
              style={{ backgroundColor: "#0b1322", border: "1px solid #18253a" }}
            >
              Sessão ativa
            </span>
            <span className="text-sm text-slate-500">
              Logado como <span className="font-medium text-slate-200">{currentUsername}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => router.push("/progression")}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors hover:text-white"
            style={{ backgroundColor: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.22)", color: "#22d3ee" }}
          >
            <TrendingUp className="h-4 w-4" />
            Progressão
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:text-white disabled:cursor-wait disabled:opacity-70"
            style={{ backgroundColor: "#0b1322", border: "1px solid #18253a" }}
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? "Saindo..." : "Sair"}
          </button>
        </div>

        {/* Hero + Control panel */}
        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.18fr)_390px]">
          {/* No mobile o ControlPanel vem primeiro (order-first) para o botão de análise aparecer antes do hero */}
          <div className="order-2 xl:order-1">
            <HeroPanel
              run={run}
              activeJob={activeJob}
              config={initialSnapshot.config}
              availableLeagueCount={initialSnapshot.supportedLeagues.length}
              availableBookmakerCount={initialSnapshot.supportedBookmakers.length}
              diagnostics={currentDiagnostics}
            />
          </div>
          <div className="order-1 xl:order-2">
            <ControlPanel
              config={initialSnapshot.config}
              filters={filters}
              leagues={initialSnapshot.supportedLeagues}
              regulatedBookmakerCount={initialSnapshot.supportedBookmakers.length}
              markets={initialSnapshot.supportedMarkets}
              isPending={isAnalyzing}
              isRestarting={isRestarting}
              isClearing={isClearing}
              onRun={handleAnalyze}
              onRestart={handleForceRestart}
              onClear={handleClear}
              onChange={setFilters}
              onToggleLeague={toggleLeague}
              onToggleMarket={toggleMarket}
              diagnostics={currentDiagnostics}
            />
          </div>
        </section>

        {/* Status compacto + Accumulator */}
        {(isActiveJobPending || error || copyFeedback || (currentDiagnostics.selectedRemainingInWindow === 0)) ? (
          <div className="space-y-2">
            {isActiveJobPending ? (
              <AlertBlock tone="amber" message={activeJob.message} />
            ) : null}
            {currentDiagnostics.selectedRemainingInWindow === 0 && !isActiveJobPending ? (
              <AlertBlock tone="amber" title="Sem fixtures no escopo" message={noFixtureMessage} />
            ) : null}
            {error ? (
              <AlertBlock
                tone="rose"
                title={timeoutByVolume ? "Timeout por volume" : undefined}
                message={error}
              />
            ) : null}
            {copyFeedback ? <AlertBlock tone="emerald" message={copyFeedback} /> : null}
          </div>
        ) : null}

        <section>
          <PanelCard
            title="Múltipla sugerida"
            subtitle={
              run?.accumulator
                ? `Odd combinada ${formatOdd(run.accumulator.combinedOdd)}`
                : "Montada quando houver picks válidas"
            }
            icon={BadgePercent}
          >
            {run?.accumulator ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  {initialSnapshot.config.singleBookmakerMode ? (
                    <a
                      href={initialSnapshot.config.primaryBookmakerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
                      style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir {initialSnapshot.config.primaryBookmakerName}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleCopyAccumulator}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
                    style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
                  >
                    <Copy className="h-4 w-4" />
                    Copiar múltipla
                  </button>
                </div>

                {/* Accumulator banner */}
                <div
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: "#070d1a", border: "1px solid #1a2840" }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Construção
                      </p>
                      <h3 className="mt-2 text-3xl font-bold tracking-[-0.05em] text-white">
                        {formatOdd(run.accumulator.combinedOdd)}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">
                        Alvo: {formatOdd(run.accumulator.targetOdd)}
                      </p>
                      <p className="text-sm text-slate-500">
                        Confiança: {run.accumulator.confidence.toFixed(0)} / 100
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-400">
                    {run.accumulator.rationale}
                  </p>
                </div>

                {/* Accumulator picks list */}
                <div className="space-y-2.5">
                  {run.accumulator.picks.map((pick) => (
                    <div
                      key={`multi:${pick.candidateId}`}
                      className="flex items-center justify-between gap-3 rounded-2xl p-4"
                      style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{pick.selection}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                          {pick.fixtureLabel}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          Melhor odd em {pick.bookmaker}
                        </p>
                      </div>
                      <div
                        className="flex-shrink-0 rounded-full px-3 py-1.5 text-sm font-bold"
                        style={{
                          background: "linear-gradient(135deg, #22D3EE, #0EA5E9)",
                          color: "#060A14",
                        }}
                      >
                        {formatOdd(pick.bestOdd)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyCompactState
                title="Múltipla guardada"
                description="Assim que o motor encontrar combinações com edge e correlação saudável, a montagem aparece aqui."
              />
            )}
          </PanelCard>
        </section>

        {/* Picks radar */}
        <PanelCard
          title="Radar de picks"
          subtitle={`${picks.length} oportunidades ordenadas por confiança e edge`}
          icon={Flame}
        >
          {picks.length ? (
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {picks.map((pick, index) => (
                <PickCard
                  key={pick.candidateId}
                  pick={pick}
                  index={index}
                  singleBookmakerMode={initialSnapshot.config.singleBookmakerMode}
                  bookmakerUrl={initialSnapshot.config.primaryBookmakerUrl}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <EmptyRunState
                title="Radar vazio por enquanto"
                description="Assim que você rodar a análise, as picks entram aqui já com odd, confiança e casa destacada."
              />
              <EmptyFeatureState
                title="Detalhes sob demanda"
                description="A favor, Atenção e Dossiê aparecem por botão, para o painel não virar uma parede de texto."
              />
              <EmptyFeatureState
                title="Leitura compacta"
                description="Cada card prioriza seleção, odd justa, edge e melhor casa antes de abrir o resto."
              />
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

function PipelineStep({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="relative rounded-2xl p-4"
      style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
    >
      <p
        className="text-4xl font-bold tracking-[-0.08em]"
        style={{ color: "rgba(34,211,238,0.12)" }}
      >
        {step}
      </p>
      <p className="mt-2 text-sm font-semibold text-white">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
    </motion.div>
  );
}

function ValidationMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function ValidationList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; meta: string; value: string }>;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2.5">
        {rows.length ? (
          rows.map((row) => (
            <div
              key={`${title}:${row.label}`}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: "#0a1020", border: "1px solid #17253b" }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{row.label}</p>
                <p className="text-[11px] text-slate-500">{row.meta}</p>
              </div>
              <span className="text-sm font-semibold text-cyan-300">{row.value}</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">Ainda sem volume histórico suficiente.</p>
        )}
      </div>
    </div>
  );
}

function AlertBlock({
  tone,
  title,
  message,
}: {
  tone: "amber" | "rose" | "emerald";
  title?: string;
  message: string;
}) {
  const styles = {
    amber: {
      backgroundColor: "rgba(251,191,36,0.08)",
      border: "1px solid rgba(251,191,36,0.20)",
      color: "#FCD34D",
    },
    rose: {
      backgroundColor: "rgba(251,113,133,0.08)",
      border: "1px solid rgba(251,113,133,0.20)",
      color: "#FDA4AF",
    },
    emerald: {
      backgroundColor: "rgba(52,211,153,0.08)",
      border: "1px solid rgba(52,211,153,0.20)",
      color: "#6EE7B7",
    },
  }[tone];

  return (
    <div className="rounded-2xl px-4 py-3 text-sm leading-6" style={styles}>
      {title ? (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]">{title}</p>
      ) : null}
      {message}
    </div>
  );
}

function EmptyRunState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: "#111a2c",
        border: "1px dashed #1e2d42",
      }}
    >
      <div
        className="mb-3 inline-flex rounded-xl p-3"
        style={{
          backgroundColor: "rgba(34,211,238,0.10)",
          border: "1px solid rgba(34,211,238,0.20)",
        }}
      >
        <Sparkles className="h-4 w-4 text-[#22D3EE]" />
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function EmptyCompactState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "#111a2c", border: "1px dashed #1e2d42" }}
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function EmptyFeatureState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "#111a2c", border: "1px solid #1e2d42" }}
    >
      <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-600">Preview</p>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function formatSigned(value: number) {
  const fixed = value.toFixed(2);
  return value > 0 ? `+${fixed}` : fixed;
}

type ScanDiagnostics = {
  scanDate: string;
  totalRemainingInWindow: number;
  selectedRemainingInWindow: number;
  missingSelectedLeagues: SupportedLeague[];
  leagueCounts: Record<number, number>;
};

function buildScanDiagnostics(
  scanFixtures: DashboardSnapshot["scanFixtures"],
  supportedLeagues: SupportedLeague[],
  scanDate: string,
  selectedLeagueIds: number[],
  nowMs: number,
): ScanDiagnostics {
  const fixturesInWindow = scanFixtures.filter((fixture) => {
    if (fixture.scanDate !== scanDate) {
      return false;
    }

    const kickoffAt = new Date(fixture.kickoffAt).getTime();
    return Number.isFinite(kickoffAt) && kickoffAt > nowMs;
  });

  const leagueCounts = fixturesInWindow.reduce<Record<number, number>>((accumulator, fixture) => {
    accumulator[fixture.leagueId] = (accumulator[fixture.leagueId] ?? 0) + 1;
    return accumulator;
  }, {});

  const selectedRemainingInWindow = selectedLeagueIds.length
    ? fixturesInWindow.filter((fixture) => selectedLeagueIds.includes(fixture.leagueId))
    : fixturesInWindow;
  const activeLeagueIds = new Set(fixturesInWindow.map((fixture) => fixture.leagueId));
  const missingSelectedLeagues = selectedLeagueIds
    .filter((leagueId) => !activeLeagueIds.has(leagueId))
    .map((leagueId) => supportedLeagues.find((league) => league.id === leagueId))
    .filter((league): league is SupportedLeague => Boolean(league));

  return {
    scanDate,
    totalRemainingInWindow: fixturesInWindow.length,
    selectedRemainingInWindow: selectedRemainingInWindow.length,
    missingSelectedLeagues,
    leagueCounts,
  };
}

function getNoFixtureMessage(diagnostics: ScanDiagnostics, usingLeagueFilter: boolean) {
  const dateLabel = getScanDateLabel(diagnostics.scanDate);
  const dateLabelLower = getScanDateLabelLower(diagnostics.scanDate);

  if (!diagnostics.totalRemainingInWindow) {
    return `${dateLabel} não restam partidas futuras dentro da janela selecionada. Nesse cenário o radar zera antes mesmo de buscar odds.`;
  }

  if (usingLeagueFilter && diagnostics.selectedRemainingInWindow === 0) {
    const sample = diagnostics.missingSelectedLeagues
      .slice(0, 4)
      .map((league) => league.name)
      .join(", ");

    return sample
      ? `${dateLabel} ainda existem ${diagnostics.totalRemainingInWindow} jogos no total nesse recorte, mas as ligas selecionadas não têm partidas futuras nele. Ex.: ${sample}.`
      : `${dateLabel} ainda existem ${diagnostics.totalRemainingInWindow} jogos no total nesse recorte, mas as ligas selecionadas não têm partidas futuras nele.`;
  }

  return `Restam ${diagnostics.selectedRemainingInWindow} jogos futuros em ${dateLabelLower} dentro do seu escopo atual.`;
}

function getResultDiagnosis(
  run: AnalysisRun | null,
  diagnostics: ScanDiagnostics,
  usingLeagueFilter: boolean,
) {
  if (!run || run.picks.length > 0) {
    return null;
  }

  if (run.fixturesScanned === 0) {
    return {
      tone: "amber" as const,
      title: "Falta de fixture",
      message: getNoFixtureMessage(diagnostics, usingLeagueFilter),
    };
  }

  if (run.candidatesScanned === 0) {
    const scanDateLabelLower = getScanDateLabelLower(run.filters.scanDate);
    return {
      tone: "amber" as const,
      title: "Sem odds elegíveis",
      message: `O radar encontrou ${run.fixturesScanned} jogos futuros no escopo, mas o feed não devolveu odds elegíveis dentro da faixa ${formatOdd(run.filters.minOdd)}-${formatOdd(run.filters.maxOdd)} para ${scanDateLabelLower}.`,
    };
  }

  return {
    tone: "amber" as const,
    title: "Corte final de valor",
    message: `O radar encontrou ${run.candidatesScanned} mercados com odds, mas todos ficaram fora do corte final de valor/risco depois do score e da revisão da IA.`,
  };
}
