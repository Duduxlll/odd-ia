import { NextResponse } from "next/server";

import { assertInternalRequest } from "@/lib/internal-auth";
import { processAnalysisQueue } from "@/lib/worker";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function GET(request: Request) {
  try {
    assertInternalRequest(request);
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId") ?? undefined;
    const result = await processAnalysisQueue(jobId);

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
