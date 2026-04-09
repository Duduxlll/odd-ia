import { createClient } from "@libsql/client";

import { DEFAULT_FILTERS } from "@/lib/constants";
import type {
  AnalysisPick,
  AnalysisRun,
  ClvSnapshot,
  LineMovementSnapshot,
  PerformanceBucket,
  PerformanceSummary,
  PickTrackingSnapshot,
  RefereeStatsSnapshot,
  XgContextSnapshot,
} from "@/lib/types";
import { env } from "@/lib/env";

const db = createClient({
  url: env.TURSO_DATABASE_URL || "file:analise-ia.db",
  authToken: env.TURSO_AUTH_TOKEN || undefined,
});

const RUNS_TABLE = "radar_analysis_runs";
const PICKS_TABLE = "radar_analysis_picks";
const SNAPSHOTS_TABLE = "radar_market_snapshots";

let schemaPromise: Promise<void> | null = null;

function parseJson<T>(value: unknown, fallback: T) {
  if (typeof value !== "string" || !value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function averageOrNull(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((total, value) => total + value, 0) / filtered.length;
}

async function ensureColumnExists(tableName: string, columnName: string, sqlType: string, defaultValue: string) {
  const info = await db.execute(`PRAGMA table_info(${tableName})`);
  const hasColumn = info.rows.some((row) => String((row as Record<string, unknown>).name) === columnName);

  if (!hasColumn) {
    await db.execute(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlType} NOT NULL DEFAULT '${defaultValue}'`,
    );
  }
}

function mapPickRow(row: Record<string, unknown>): AnalysisPick {
  const xgContext = parseJson<XgContextSnapshot | null>(row.xg_context_json, null);
  const lineMovement = parseJson<LineMovementSnapshot | null>(row.line_movement_json, null);
  const clv = parseJson<ClvSnapshot | null>(row.clv_json, null);
  const tracking =
    parseJson<PickTrackingSnapshot | null>(row.tracking_json, null) ?? {
      status: "open",
      settledAt: null,
      resultLabel: null,
      profitUnits: null,
    };
  const refereeStats = parseJson<RefereeStatsSnapshot | null>(row.referee_stats_json, null);

  return {
    candidateId: String(row.candidate_id),
    fixtureId: numberValue(row.fixture_id),
    fixtureLabel: String(row.fixture_label),
    fixtureDate: String(row.fixture_date),
    leagueId: numberValue(row.league_id),
    leagueName: String(row.league_name),
    leagueCountry: String(row.league_country),
    homeTeam: String(row.home_team),
    awayTeam: String(row.away_team),
    marketId: numberValue(row.market_id),
    marketName: String(row.market_name),
    marketCategory: String(row.market_category) as AnalysisPick["marketCategory"],
    selection: String(row.selection),
    selectionKey: String(row.selection_key),
    bestOdd: numberValue(row.best_odd),
    consensusOdd: numberValue(row.consensus_odd),
    sportsbookCount: numberValue(row.sportsbook_count),
    bookmaker: String(row.bookmaker),
    bookmakerPool: parseJson<string[]>(row.bookmaker_pool_json, []),
    impliedProbability: numberValue(row.implied_probability),
    modelProbability: numberValue(row.model_probability),
    fairOdd: numberValue(row.fair_odd),
    edge: numberValue(row.edge),
    expectedValue: numberValue(row.expected_value),
    confidence: numberValue(row.confidence),
    riskScore: numberValue(row.risk_score),
    dataQualityScore: numberValue(row.data_quality_score),
    xgContext,
    lineMovement,
    clv,
    tracking,
    refereeStats,
    lineupStatus: String(row.lineup_status) as AnalysisPick["lineupStatus"],
    predictionPulse: String(row.prediction_pulse),
    summary: String(row.summary),
    reasons: parseJson<string[]>(row.reasons_json, []),
    cautions: parseJson<string[]>(row.cautions_json, []),
    analysisSections: parseJson(row.analysis_sections_json, []),
    newsNote: row.news_note ? String(row.news_note) : null,
    aiVerdict: String(row.ai_verdict) as AnalysisPick["aiVerdict"],
    aiConfidenceLabel: String(row.ai_confidence_label) as AnalysisPick["aiConfidenceLabel"],
  };
}

export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ${RUNS_TABLE} (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          filters_json TEXT NOT NULL,
          fixtures_scanned INTEGER NOT NULL,
          candidates_scanned INTEGER NOT NULL,
          executive_summary TEXT NOT NULL,
          system_note TEXT NOT NULL,
          accumulator_json TEXT
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS ${PICKS_TABLE} (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          fixture_id INTEGER NOT NULL,
          fixture_label TEXT NOT NULL,
          fixture_date TEXT NOT NULL,
          league_id INTEGER NOT NULL,
          league_name TEXT NOT NULL,
          league_country TEXT NOT NULL,
          home_team TEXT NOT NULL,
          away_team TEXT NOT NULL,
          market_id INTEGER NOT NULL,
          market_name TEXT NOT NULL,
          market_category TEXT NOT NULL,
          selection TEXT NOT NULL,
          selection_key TEXT NOT NULL,
          best_odd REAL NOT NULL,
          consensus_odd REAL NOT NULL,
          sportsbook_count INTEGER NOT NULL,
          bookmaker TEXT NOT NULL,
          bookmaker_pool_json TEXT NOT NULL,
          implied_probability REAL NOT NULL,
          model_probability REAL NOT NULL,
          fair_odd REAL NOT NULL,
          edge REAL NOT NULL,
          expected_value REAL NOT NULL,
          confidence REAL NOT NULL,
          risk_score REAL NOT NULL,
          data_quality_score REAL NOT NULL,
          xg_context_json TEXT NOT NULL DEFAULT 'null',
          line_movement_json TEXT NOT NULL DEFAULT 'null',
          clv_json TEXT NOT NULL DEFAULT 'null',
          tracking_json TEXT NOT NULL DEFAULT '{"status":"open","settledAt":null,"resultLabel":null,"profitUnits":null}',
          referee_stats_json TEXT NOT NULL DEFAULT 'null',
          lineup_status TEXT NOT NULL,
          prediction_pulse TEXT NOT NULL,
          summary TEXT NOT NULL,
          reasons_json TEXT NOT NULL,
          cautions_json TEXT NOT NULL,
          analysis_sections_json TEXT NOT NULL DEFAULT '[]',
          news_note TEXT,
          ai_verdict TEXT NOT NULL,
          ai_confidence_label TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES ${RUNS_TABLE}(id)
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS ${SNAPSHOTS_TABLE} (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          fixture_id INTEGER NOT NULL,
          market_name TEXT NOT NULL,
          selection TEXT NOT NULL,
          bookmaker TEXT NOT NULL,
          best_odd REAL NOT NULL,
          consensus_odd REAL NOT NULL,
          sportsbook_count INTEGER NOT NULL,
          observed_at TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES ${RUNS_TABLE}(id)
        )
      `);

      await ensureColumnExists(PICKS_TABLE, "analysis_sections_json", "TEXT", "[]");
      await ensureColumnExists(PICKS_TABLE, "xg_context_json", "TEXT", "null");
      await ensureColumnExists(PICKS_TABLE, "line_movement_json", "TEXT", "null");
      await ensureColumnExists(PICKS_TABLE, "clv_json", "TEXT", "null");
      await ensureColumnExists(
        PICKS_TABLE,
        "tracking_json",
        "TEXT",
        '{"status":"open","settledAt":null,"resultLabel":null,"profitUnits":null}',
      );
      await ensureColumnExists(PICKS_TABLE, "referee_stats_json", "TEXT", "null");
    })();
  }

  await schemaPromise;
}

export async function saveAnalysisRun(
  run: AnalysisRun,
  marketSnapshots: Array<{
    candidateId: string;
    fixtureId: number;
    marketName: string;
    selection: string;
    bookmaker: string;
    bestOdd: number;
    consensusOdd: number;
    sportsbookCount: number;
  }> = [],
) {
  await ensureSchema();

  await db.execute({
    sql: `
      INSERT INTO ${RUNS_TABLE} (
        id,
        created_at,
        filters_json,
        fixtures_scanned,
        candidates_scanned,
        executive_summary,
        system_note,
        accumulator_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      run.id,
      run.createdAt,
      JSON.stringify(run.filters),
      run.fixturesScanned,
      run.candidatesScanned,
      run.executiveSummary,
      run.systemNote,
      JSON.stringify(run.accumulator),
    ],
  });

  for (const pick of run.picks) {
    await db.execute({
      sql: `
        INSERT INTO ${PICKS_TABLE} (
          id,
          run_id,
          candidate_id,
          fixture_id,
          fixture_label,
          fixture_date,
          league_id,
          league_name,
          league_country,
          home_team,
          away_team,
          market_id,
          market_name,
          market_category,
          selection,
          selection_key,
          best_odd,
          consensus_odd,
          sportsbook_count,
          bookmaker,
          bookmaker_pool_json,
          implied_probability,
          model_probability,
          fair_odd,
          edge,
          expected_value,
          confidence,
          risk_score,
          data_quality_score,
          xg_context_json,
          line_movement_json,
          clv_json,
          tracking_json,
          referee_stats_json,
          lineup_status,
          prediction_pulse,
          summary,
          reasons_json,
          cautions_json,
          analysis_sections_json,
          news_note,
          ai_verdict,
          ai_confidence_label,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        `${run.id}:${pick.candidateId}`,
        run.id,
        pick.candidateId,
        pick.fixtureId,
        pick.fixtureLabel,
        pick.fixtureDate,
        pick.leagueId,
        pick.leagueName,
        pick.leagueCountry,
        pick.homeTeam,
        pick.awayTeam,
        pick.marketId,
        pick.marketName,
        pick.marketCategory,
        pick.selection,
        pick.selectionKey,
        pick.bestOdd,
        pick.consensusOdd,
        pick.sportsbookCount,
        pick.bookmaker,
        JSON.stringify(pick.bookmakerPool),
        pick.impliedProbability,
        pick.modelProbability,
        pick.fairOdd,
        pick.edge,
        pick.expectedValue,
        pick.confidence,
        pick.riskScore,
        pick.dataQualityScore,
        JSON.stringify(pick.xgContext),
        JSON.stringify(pick.lineMovement),
        JSON.stringify(pick.clv),
        JSON.stringify(pick.tracking),
        JSON.stringify(pick.refereeStats),
        pick.lineupStatus,
        pick.predictionPulse,
        pick.summary,
        JSON.stringify(pick.reasons),
        JSON.stringify(pick.cautions),
        JSON.stringify(pick.analysisSections),
        pick.newsNote,
        pick.aiVerdict,
        pick.aiConfidenceLabel,
        run.createdAt,
      ],
    });
  }

  for (const snapshot of marketSnapshots) {
    await db.execute({
      sql: `
        INSERT INTO ${SNAPSHOTS_TABLE} (
          id,
          run_id,
          candidate_id,
          fixture_id,
          market_name,
          selection,
          bookmaker,
          best_odd,
          consensus_odd,
          sportsbook_count,
          observed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        `${run.id}:${snapshot.candidateId}`,
        run.id,
        snapshot.candidateId,
        snapshot.fixtureId,
        snapshot.marketName,
        snapshot.selection,
        snapshot.bookmaker,
        snapshot.bestOdd,
        snapshot.consensusOdd,
        snapshot.sportsbookCount,
        run.createdAt,
      ],
    });
  }
}

export async function getLatestAnalysisRun() {
  await ensureSchema();

  const latestRunResult = await db.execute({
    sql: `SELECT * FROM ${RUNS_TABLE} ORDER BY created_at DESC LIMIT 1`,
  });

  if (!latestRunResult.rows.length) {
    return null;
  }

  const row = latestRunResult.rows[0] as Record<string, unknown>;
  const picksResult = await db.execute({
    sql: `SELECT * FROM ${PICKS_TABLE} WHERE run_id = ? ORDER BY confidence DESC, edge DESC`,
    args: [String(row.id)],
  });

  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    filters: parseJson(row.filters_json, DEFAULT_FILTERS),
    fixturesScanned: numberValue(row.fixtures_scanned),
    candidatesScanned: numberValue(row.candidates_scanned),
    executiveSummary: String(row.executive_summary),
    systemNote: String(row.system_note),
    accumulator: parseJson(row.accumulator_json, null) as AnalysisRun["accumulator"],
    picks: picksResult.rows.map((pickRow) => mapPickRow(pickRow as Record<string, unknown>)),
  } satisfies AnalysisRun;
}

function chunkValues<T>(values: T[], chunkSize = 100) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function getLineHistoryByCandidateIds(candidateIds: string[]) {
  await ensureSchema();

  const history = new Map<
    string,
    {
      openingOdd: number | null;
      previousOdd: number | null;
      sampleCount: number;
    }
  >();

  if (!candidateIds.length) {
    return history;
  }

  for (const group of chunkValues(candidateIds, 120)) {
    const placeholders = group.map(() => "?").join(", ");
    const result = await db.execute({
      sql: `
        SELECT candidate_id, best_odd, observed_at
        FROM ${SNAPSHOTS_TABLE}
        WHERE candidate_id IN (${placeholders})
        ORDER BY observed_at ASC
      `,
      args: group,
    });

    const perCandidate = new Map<string, number[]>();

    for (const row of result.rows) {
      const record = row as Record<string, unknown>;
      const candidateId = String(record.candidate_id);
      const current = perCandidate.get(candidateId) ?? [];
      current.push(numberValue(record.best_odd));
      perCandidate.set(candidateId, current);
    }

    for (const [candidateId, odds] of perCandidate) {
      history.set(candidateId, {
        openingOdd: odds[0] ?? null,
        previousOdd: odds.at(-1) ?? null,
        sampleCount: odds.length,
      });
    }
  }

  return history;
}

export async function getTrackedPicksForRefresh() {
  await ensureSchema();

  const result = await db.execute({
    sql: `
      SELECT *
      FROM ${PICKS_TABLE}
      ORDER BY fixture_date ASC, created_at ASC
    `,
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id),
      candidateId: String(record.candidate_id),
      fixtureId: numberValue(record.fixture_id),
      fixtureDate: String(record.fixture_date),
      marketCategory: String(record.market_category) as AnalysisPick["marketCategory"],
      marketName: String(record.market_name),
      selection: String(record.selection),
      homeTeam: String(record.home_team),
      awayTeam: String(record.away_team),
      bestOdd: numberValue(record.best_odd),
      tracking:
        parseJson<PickTrackingSnapshot | null>(record.tracking_json, null) ?? {
          status: "open",
          settledAt: null,
          resultLabel: null,
          profitUnits: null,
        },
      clv: parseJson<ClvSnapshot | null>(record.clv_json, null),
    };
  });
}

export async function getLatestClosingOdd(candidateId: string, fixtureDate: string) {
  await ensureSchema();

  const result = await db.execute({
    sql: `
      SELECT best_odd
      FROM ${SNAPSHOTS_TABLE}
      WHERE candidate_id = ?
        AND observed_at <= ?
      ORDER BY observed_at DESC
      LIMIT 1
    `,
    args: [candidateId, fixtureDate],
  });

  if (!result.rows.length) {
    return null;
  }

  return numberValue((result.rows[0] as Record<string, unknown>).best_odd, NaN);
}

export async function updatePickLifecycle(params: {
  id: string;
  clv: ClvSnapshot | null;
  tracking: PickTrackingSnapshot;
}) {
  await ensureSchema();

  await db.execute({
    sql: `
      UPDATE ${PICKS_TABLE}
      SET clv_json = ?, tracking_json = ?
      WHERE id = ?
    `,
    args: [JSON.stringify(params.clv), JSON.stringify(params.tracking), params.id],
  });
}

function createEmptyBucket(key: string, label: string): PerformanceBucket {
  return {
    key,
    label,
    total: 0,
    settled: 0,
    wins: 0,
    losses: 0,
    voids: 0,
    ungraded: 0,
    roiUnits: 0,
    hitRate: null,
    averageClv: null,
    positiveClvRate: null,
  };
}

function finalizeBuckets(buckets: Map<string, PerformanceBucket>) {
  return Array.from(buckets.values())
    .map((bucket) => {
      const graded = bucket.wins + bucket.losses;
      const clvResult = bucket as PerformanceBucket & {
        __clvValues?: Array<number | null>;
        __positiveClv?: number;
        __clvCount?: number;
      };

      bucket.hitRate = graded ? bucket.wins / graded : null;
      bucket.averageClv = averageOrNull(clvResult.__clvValues ?? []);
      bucket.positiveClvRate = clvResult.__clvCount
        ? (clvResult.__positiveClv ?? 0) / clvResult.__clvCount
        : null;

      delete clvResult.__clvValues;
      delete clvResult.__positiveClv;
      delete clvResult.__clvCount;

      return bucket;
    })
    .sort((left, right) => right.settled - left.settled || right.roiUnits - left.roiUnits);
}

function accumulateBucket(
  buckets: Map<string, PerformanceBucket>,
  key: string,
  label: string,
  tracking: PickTrackingSnapshot,
  clv: ClvSnapshot | null,
) {
  const existing =
    (buckets.get(key) as PerformanceBucket & {
      __clvValues?: Array<number | null>;
      __positiveClv?: number;
      __clvCount?: number;
    }) ?? createEmptyBucket(key, label);

  existing.total += 1;

  if (tracking.status === "won") {
    existing.settled += 1;
    existing.wins += 1;
    existing.roiUnits += tracking.profitUnits ?? 0;
  } else if (tracking.status === "lost") {
    existing.settled += 1;
    existing.losses += 1;
    existing.roiUnits += tracking.profitUnits ?? 0;
  } else if (tracking.status === "void") {
    existing.settled += 1;
    existing.voids += 1;
    existing.roiUnits += tracking.profitUnits ?? 0;
  } else if (tracking.status === "ungraded") {
    existing.ungraded += 1;
  }

  if (clv && clv.status !== "pending" && clv.status !== "unavailable") {
    existing.__clvValues = [...(existing.__clvValues ?? []), clv.delta];
    existing.__clvCount = (existing.__clvCount ?? 0) + 1;
    if (clv.status === "positive") {
      existing.__positiveClv = (existing.__positiveClv ?? 0) + 1;
    }
  }

  buckets.set(key, existing);
}

export async function getPerformanceSummary() {
  await ensureSchema();

  const rows = await db.execute({
    sql: `
      SELECT league_name, market_category, ai_confidence_label, tracking_json, clv_json
      FROM ${PICKS_TABLE}
    `,
  });

  let totalTracked = 0;
  let settledCount = 0;
  let wins = 0;
  let losses = 0;
  let voids = 0;
  let ungraded = 0;
  let openCount = 0;
  let roiUnits = 0;
  const clvValues: Array<number | null> = [];
  let positiveClv = 0;
  let clvCount = 0;

  const byMarket = new Map<string, PerformanceBucket>();
  const byLeague = new Map<string, PerformanceBucket>();
  const byConfidence = new Map<string, PerformanceBucket>();

  for (const row of rows.rows) {
    const record = row as Record<string, unknown>;
    const tracking =
      parseJson<PickTrackingSnapshot | null>(record.tracking_json, null) ?? {
        status: "open",
        settledAt: null,
        resultLabel: null,
        profitUnits: null,
      };
    const clv = parseJson<ClvSnapshot | null>(record.clv_json, null);

    totalTracked += 1;

    if (tracking.status === "won") {
      settledCount += 1;
      wins += 1;
      roiUnits += tracking.profitUnits ?? 0;
    } else if (tracking.status === "lost") {
      settledCount += 1;
      losses += 1;
      roiUnits += tracking.profitUnits ?? 0;
    } else if (tracking.status === "void") {
      settledCount += 1;
      voids += 1;
      roiUnits += tracking.profitUnits ?? 0;
    } else if (tracking.status === "ungraded") {
      ungraded += 1;
    } else {
      openCount += 1;
    }

    if (clv && clv.status !== "pending" && clv.status !== "unavailable") {
      clvValues.push(clv.delta);
      clvCount += 1;
      if (clv.status === "positive") {
        positiveClv += 1;
      }
    }

    accumulateBucket(
      byMarket,
      String(record.market_category),
      String(record.market_category),
      tracking,
      clv,
    );
    accumulateBucket(
      byLeague,
      String(record.league_name),
      String(record.league_name),
      tracking,
      clv,
    );
    accumulateBucket(
      byConfidence,
      String(record.ai_confidence_label),
      String(record.ai_confidence_label),
      tracking,
      clv,
    );
  }

  const graded = wins + losses;
  const stakeBase = wins + losses + voids;

  return {
    totalTracked,
    settledCount,
    wins,
    losses,
    voids,
    ungraded,
    openCount,
    roiUnits,
    roiPct: stakeBase ? roiUnits / stakeBase : null,
    hitRate: graded ? wins / graded : null,
    averageClv: averageOrNull(clvValues),
    positiveClvRate: clvCount ? positiveClv / clvCount : null,
    byMarket: finalizeBuckets(byMarket),
    byLeague: finalizeBuckets(byLeague),
    byConfidence: finalizeBuckets(byConfidence),
  } satisfies PerformanceSummary;
}

export async function clearAnalysisHistory() {
  await ensureSchema();

  await db.execute(`DELETE FROM ${SNAPSHOTS_TABLE}`);
  await db.execute(`DELETE FROM ${PICKS_TABLE}`);
  await db.execute(`DELETE FROM ${RUNS_TABLE}`);
}
