import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { getSessionFromRequest, type SessionPayload } from "./session";
import { RewardEngineError } from "../bluebank/rewardEngine";

/** Thrown by route handlers for any expected failure (auth, validation,
 * not-found, etc). Every route's catch block should funnel into
 * apiErrorResponse() rather than hand-rolling status codes inline, so error
 * shape stays consistent across the whole API surface. */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

/** Returns the session or throws a 401. Use for any route that requires
 * being logged in but doesn't care which role. */
export async function requireSession(req: NextRequest): Promise<SessionPayload> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    throw new ApiError(401, "UNAUTHENTICATED", "You must be logged in to do this.");
  }
  return session;
}

/** Returns the session or throws 401/403. Use for any route restricted to
 * specific roles — this is the primary RBAC gate for the whole app. */
export async function requireRole(req: NextRequest, allowedRoles: UserRole[]): Promise<SessionPayload> {
  const session = await requireSession(req);
  if (!allowedRoles.includes(session.role)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      `This action requires one of these roles: ${allowedRoles.join(", ")}.`
    );
  }
  return session;
}

/** Maps any thrown error to a JSON response with an appropriate status code.
 * Every route handler should end its catch block with `return
 * apiErrorResponse(err)` rather than reimplementing this mapping. */
export function apiErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  if (err instanceof RewardEngineError) {
    // Reward-engine failures are almost always client-correctable (already
    // processed, not scoped, no active rate) rather than server bugs, so
    // 400/409 fits better than a bare 500.
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "OPERATOR_NOT_SCOPED" ? 403 : 409;
    return NextResponse.json({ error: err.code, message: err.message }, { status });
  }
  console.error("Unhandled API error:", err);
  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "Something went wrong on our end." },
    { status: 500 }
  );
}
