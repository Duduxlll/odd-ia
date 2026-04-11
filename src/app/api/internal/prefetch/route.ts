import { after } from "next/server";
import { NextResponse } from "next/server";

import { DEFAULT_FILTERS } from "@/lib/constants";
import { assertInternalRequest } from "@/lib/internal-auth";
import { prefetchRadarData } from "@/lib/prefetch";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function GET(request: Request) {
  try {
    assertInternalRequest(request);

    after(async () => {
      await prefetchRadarData(DEFAULT_FILTERS);
    });

    return NextResponse.json({ ok: true, message: "Prefetch iniciado." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
