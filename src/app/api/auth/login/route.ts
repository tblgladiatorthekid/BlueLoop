import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signSession, setSessionCookie } from "@/lib/auth/session";
import { ApiError, apiErrorResponse } from "@/lib/auth/rbac";

const bodySchema = z.object({
  phone: z.string().trim().min(8).max(20),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { phone: body.phone } });

    // Same error for "no such user" and "wrong password" — being specific
    // here just tells an attacker which phone numbers are registered.
    const invalidCredentials = () =>
      new ApiError(401, "INVALID_CREDENTIALS", "Incorrect phone number or password.");

    if (!user) throw invalidCredentials();

    const passwordOk = await verifyPassword(body.password, user.passwordHash);
    if (!passwordOk) throw invalidCredentials();

    if (user.status !== "ACTIVE") {
      throw new ApiError(403, "ACCOUNT_NOT_ACTIVE", "This account is suspended or pending approval.");
    }

    const token = await signSession({ sub: user.id, role: user.role, phone: user.phone });
    const response = NextResponse.json({
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    });
    setSessionCookie(response, token);
    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid input.", issues: err.issues },
        { status: 400 }
      );
    }
    return apiErrorResponse(err);
  }
}
