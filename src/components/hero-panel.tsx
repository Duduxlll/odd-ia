"use client";

import type { LucideIcon } from "lucide-react";
import { Brain, Database, Layers3, Radar, Zap } from "lucide-react";
import { motion } from "framer-motion";

import type { AnalysisJob, AnalysisRun, ConfigStatus } from "@/lib/types";
import { formatDateTimeInSaoPaulo, formatOdd } from "@/lib/utils";

function Metric({
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
      style={{
        backgroundColor: "#111a2c",
        border: "1px solid #1e2d42",
      }}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  status,
  active,
}: {
  icon: LucideIcon;
  label: string;
  status: string;
  active: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
      style={{
        backgroundColor: active ? "rgba(34,211,238,0.08)" : "#111a2c",
        border: active ? "1px solid rgba(34,211,238,0.20)" : "1px solid #1e2d42",
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="flex-shrink-0 rounded-lg p-1.5"
          style={{
            backgroundColor: active ? "rgba(34,211,238,0.15)" : "#1a2840",
          }}
        >
          <Icon
            className="h-3.5 w-3.5"
            style={{ color: active ? "#22D3EE" : "#475569" }}
          />
        </div>
        <span className="truncate text-xs text-slate-300">{label}</span>
      </div>
      <span
        className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
        style={
          active
            ? {
                backgroundColor: "rgba(52,211,153,0.15)",
                color: "#34D399",
                border: "1px solid rgba(52,211,153,0.25)",
              }
            : {
                backgroundColor: "#1a2840",
                color: "#475569",
                border: "1px solid #243450",
              }
        }
      >
        {status}
      </span>
    </div>
  );
}

function ScopePill({ label }: { label: string }) {
  return (
    <span
      className="rounded-full px-3 py-1 text-[10px] uppercase tracking-widest text-slate-400"
      style={{
        backgroundColor: "#111a2c",
        border: "1px solid #1e2d42",
      }}
    >
      {label}
    </span>
  );
}

function statusLabel(enabled: boolean) {
  return enabled ? "ativo" : "pendente";
}

export function HeroPanel({
  run,
  activeJob,
  config,
  availableLeagueCount,
}: {
  run: AnalysisRun | null;
  activeJob: AnalysisJob | null;
  config: ConfigStatus;
  availableLeagueCount: number;
}) {
  const jobPending = activeJob?.status === "queued" || activeJob?.status === "running";
  const filters = activeJob?.filters ?? run?.filters;
  const leaguesLabel = filters
    ? filters.leagueIds.length
      ? `${filters.leagueIds.length} ligas ativas`
      : `todas as ${availableLeagueCount} ligas`
    : "—";
  const markets = filters?.marketCategories.length ?? 0;
  const band = filters ? `${formatOdd(filters.minOdd)}-${formatOdd(filters.maxOdd)}` : "—";

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[32px] p-6 sm:p-8"
      style={{
        backgroundColor: "#0B1120",
        border: "1px solid #1a2840",
        boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
      }}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
        <div
          className="absolute -top-24 -left-16 h-72 w-72"
          style={{
            background: "radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 70%)",
            filter: "blur(1px)",
          }}
        />
        <div
          className="absolute -top-16 right-8 h-56 w-56"
          style={{
            background: "radial-gradient(circle, rgba(245,158,11,0.14) 0%, transparent 70%)",
            filter: "blur(1px)",
          }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-36 w-96"
          style={{
            background: "radial-gradient(ellipse, rgba(167,139,250,0.08) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative">
        {/* Scope pills */}
        <div className="flex flex-wrap gap-1.5">
          <ScopePill label="Radar pessoal" />
          <ScopePill label="Futebol + IA + Turso" />
          <ScopePill
            label={config.singleBookmakerMode ? config.primaryBookmakerName : "Multi-casa"}
          />
          {filters ? <ScopePill label={`${filters.horizonHours}h`} /> : null}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
          {/* Left */}
          <div className="flex flex-col gap-5">
            <div>
              <p
                className="text-[11px] uppercase tracking-[0.3em]"
                style={{ color: "#22D3EE" }}
              >
                Radar de valor
              </p>
              <h1 className="mt-3 text-[2.5rem] leading-[0.93] tracking-[-0.05em] text-white sm:text-[3rem]">
                <span className="font-display italic" style={{ color: "#FBBF24" }}>
                  Análise clara,
                </span>{" "}
                leitura rápida e cara de produto premium.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                O painel cruza odds, xG, forma, H2H, lesões, árbitro, clima e movimento de
                linha para destacar valor sem jogar informação demais na sua cara.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <ScopePill label={leaguesLabel} />
              <ScopePill label={`${markets} famílias`} />
              <ScopePill label={`faixa ${band}`} />
              {jobPending ? (
                <ScopePill
                  label={activeJob?.status === "queued" ? "na fila do worker" : "scan em andamento"}
                />
              ) : run ? (
                <ScopePill label={`atualizado ${formatDateTimeInSaoPaulo(run.createdAt)}`} />
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Metric
                label="Fixtures"
                value={String(run?.fixturesScanned ?? 0)}
                detail="janela viva"
              />
              <Metric
                label="Mercados"
                value={String(run?.candidatesScanned ?? 0)}
                detail="antes do corte e do tracking"
              />
              <Metric
                label="Picks"
                value={String(run?.picks.length ?? 0)}
                detail="por confiança"
              />
            </div>

            <div
              className="rounded-2xl p-4"
              style={{
                backgroundColor: "#111a2c",
                border: "1px solid #1e2d42",
              }}
            >
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Resumo do radar
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {activeJob?.status === "running"
                  ? "O scan atual segue em segundo plano com os filtros já travados. Recarregar a página não derruba mais a execução."
                  : activeJob?.status === "queued"
                    ? "O job já foi persistido na fila e o worker dedicado vai assumir o scan. Isso desacopla o clique do processamento pesado."
                  : run?.executiveSummary ??
                  "Escolha o recorte e rode a análise. O painel vai preencher resumo, picks, múltipla e leitura de risco sem espalhar tudo em cards gigantes."}
              </p>
            </div>
          </div>

          {/* Right: engine status */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-3 rounded-2xl p-4"
            style={{
              backgroundColor: "#111a2c",
              border: "1px solid #1e2d42",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: "#22D3EE" }}
                >
                  Estado do motor
                </p>
                <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.03em] text-white">
                {activeJob?.status === "running"
                  ? "Escaneando agora"
                  : activeJob?.status === "queued"
                    ? "Na fila do worker"
                    : "Pronto para escanear"}
                </h2>
              </div>
              <div
                className="rounded-xl p-2.5"
                style={{
                  backgroundColor: "rgba(34,211,238,0.12)",
                  border: "1px solid rgba(34,211,238,0.22)",
                }}
              >
                <Zap className="h-4 w-4 text-[#22D3EE]" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <StatusRow
                icon={Brain}
                label={`OpenAI ${config.openAiModel}`}
                status={statusLabel(config.openai)}
                active={config.openai}
              />
              <StatusRow
                icon={Radar}
                label={`API-Football ${config.apiFootballPlanMode === "free" ? "Free" : "Pro"}`}
                status={statusLabel(config.apiFootball)}
                active={config.apiFootball}
              />
              <StatusRow
                icon={Layers3}
                label={
                  config.singleBookmakerMode
                    ? `Casa foco: ${config.primaryBookmakerName}`
                    : "Melhor odd multi-casa"
                }
                status={config.singleBookmakerMode ? "travada" : "aberta"}
                active={!config.singleBookmakerMode}
              />
              <StatusRow
                icon={Database}
                label={config.tursoRemote ? "Turso remoto" : "Fallback local"}
                status={config.tursoRemote ? "ativo" : "stand-by"}
                active={config.tursoRemote}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
