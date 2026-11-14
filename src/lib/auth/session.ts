import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";

export const SESSION_COOKIE_NAME = "blueloop_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — field operators shouldn't have to re-login mid-shift

export interface SessionPayload {
  sub: string; // user id
  role: UserRole;
  phone: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    // Fails loud at request time rather than silently signing with a weak
    // or missing secret — a misconfigured deploy should break obviously,
    // not quietly issue forgeable sessions.
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a real random secret (see .env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, phone: payload.phone })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.sub || !payload.role || !payload.phone) return null;
    return {
      sub: payload.sub as string,
      role: payload.role as UserRole,
      phone: payload.phone as string,
    };
  } catch {
    // Expired, tampered, or malformed — all treated the same as "not logged in."
    return null;
  }
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}
