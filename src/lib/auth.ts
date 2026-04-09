import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";

export const AUTH_COOKIE_NAME = "radar_value_session";
export const AUTH_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type SessionPayload = {
  exp: number;
  iat: number;
  u: string;
};

export type AuthSession = {
  expiresAt: number;
  issuedAt: number;
  username: string;
};

const authUsersSchema = z.array(
  z.object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
  }),
);

type AuthUser = {
  username: string;
  password: string;
};

export function isAuthConfigured() {
  return Boolean(env.AUTH_SECRET && getAuthUsers().length);
}

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    maxAge: AUTH_SESSION_MAX_AGE,
    path: "/",
    priority: "high" as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function validateCredentials(username: string, password: string) {
  return resolveAuthenticatedUsername(username, password) !== null;
}

export function resolveAuthenticatedUsername(username: string, password: string) {
  const normalizedUsername = username.trim();
  if (!isAuthConfigured() || !normalizedUsername) {
    return null;
  }

  const matchedUser = getAuthUsers().find(
    (user) =>
      safeCompare(normalizedUsername, user.username) && safeCompare(password, user.password),
  );

  return matchedUser?.username ?? null;
}

export function getConfiguredAuthUsernames() {
  return getAuthUsers().map((user) => user.username);
}

export function createSessionToken(username: string) {
  if (!env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET não configurado.");
  }

  const now = Date.now();
  const payloadSegment = encodePayload({
    exp: now + AUTH_SESSION_MAX_AGE * 1000,
    iat: now,
    u: username.trim(),
  });
  const signatureSegment = createSignature(payloadSegment);

  return `${payloadSegment}.${signatureSegment}`;
}

export function getSessionFromToken(token?: string | null): AuthSession | null {
  if (!token || !env.AUTH_SECRET) {
    return null;
  }

  const [payloadSegment, signatureSegment] = token.split(".");
  if (!payloadSegment || !signatureSegment) {
    return null;
  }

  if (!safeCompare(signatureSegment, createSignature(payloadSegment))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;

    if (
      typeof payload.u !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }

    if (payload.exp <= Date.now()) {
      return null;
    }

    return {
      expiresAt: payload.exp,
      issuedAt: payload.iat,
      username: payload.u,
    };
  } catch {
    return null;
  }
}

export function getSessionFromRequest(request: NextRequest) {
  return getSessionFromToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

function getAuthUsers(): AuthUser[] {
  const users = new Map<string, AuthUser>();

  if (env.AUTH_USERNAME && env.AUTH_PASSWORD) {
    users.set(env.AUTH_USERNAME.trim().toLowerCase(), {
      username: env.AUTH_USERNAME.trim(),
      password: env.AUTH_PASSWORD,
    });
  }

  if (env.AUTH_USERS_JSON?.trim()) {
    try {
      const parsed = authUsersSchema.parse(JSON.parse(env.AUTH_USERS_JSON));
      for (const user of parsed) {
        users.set(user.username.trim().toLowerCase(), {
          username: user.username.trim(),
          password: user.password,
        });
      }
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `AUTH_USERS_JSON inválido: ${error.message}`
          : "AUTH_USERS_JSON inválido.",
      );
    }
  }

  return Array.from(users.values());
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function createSignature(payloadSegment: string) {
  if (!env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET não configurado.");
  }

  return createHmac("sha256", env.AUTH_SECRET).update(payloadSegment).digest("base64url");
}

function safeCompare(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
