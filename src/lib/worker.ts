import {
  completeAnalysisJob,
  failAnalysisJob,
  getNextQueuedAnalysisJob,
  getQueuedAnalysisJobById,
  startAnalysisJob,
  touchAnalysisJob,
} from "@/lib/db";
import { getInternalBearerSecret } from "@/lib/internal-auth";
import { runFootballAnalysis } from "@/lib/analysis/engine";

export async function dispatchWorker(origin: string, jobId?: string) {
  const secret = getInternalBearerSecret();
  if (!secret) {
    return false;
  }

  const url = new URL("/api/internal/worker", origin);
  if (jobId) {
    url.searchParams.set("jobId", jobId);
  }

  try {
    await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function processAnalysisQueue(jobId?: string) {
  const queuedJob = jobId
    ? await getQueuedAnalysisJobById(jobId)
    : await getNextQueuedAnalysisJob();

  if (!queuedJob) {
    return {
      ok: true,
      processed: false,
      message: "Nenhum job elegível na fila agora.",
    };
  }

  if (queuedJob.status === "running") {
    return {
      ok: true,
      processed: false,
      message: "Esse job já está em processamento.",
      jobId: queuedJob.id,
    };
  }

  await startAnalysisJob(
    queuedJob.username,
    queuedJob.id,
    "Worker assumiu o scan e iniciou a coleta aprofundada.",
  );

  try {
    await runFootballAnalysis(queuedJob.filters, queuedJob.username, {
      onProgress: (message) => touchAnalysisJob(queuedJob.username, queuedJob.id, message),
    });
    await completeAnalysisJob(queuedJob.username, queuedJob.id);

    return {
      ok: true,
      processed: true,
      status: "completed",
      jobId: queuedJob.id,
      username: queuedJob.username,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível concluir a análise no worker.";
    await failAnalysisJob(queuedJob.username, queuedJob.id, message);

    return {
      ok: false,
      processed: true,
      status: "failed",
      jobId: queuedJob.id,
      username: queuedJob.username,
      error: message,
    };
  }
}
