import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

export function getInternalBearerSecret() {
  return env.CRON_SECRET || env.AUTH_SECRET || null;
}

export function isInternalRequestAuthorized(request: Request | NextRequest) {
  const secret = getInternalBearerSecret();
  if (!secret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function assertInternalRequest(request: Request | NextRequest) {
  if (!isInternalRequestAuthorized(request)) {
    throw new Error("Unauthorized");
  }
}
