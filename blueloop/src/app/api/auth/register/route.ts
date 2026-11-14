import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signSession, setSessionCookie } from "@/lib/auth/session";
import { ApiError, apiErrorResponse } from "@/lib/auth/rbac";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  password: z.string().min(8).max(200),
});

/**
 * Public self-registration. Deliberately always creates a PARTICIPANT — this
 * is a design decision, not an oversight. Operator, recycler, and admin
 * accounts are provisioned by an admin (see /api/admin/users) because those
 * roles carry real authority over verification and reward transactions, and
 * that shouldn't be self-service.
 */
export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (existing) {
      throw new ApiError(409, "PHONE_ALREADY_REGISTERED", "An account with this phone number already exists.");
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        phone: body.phone,
        passwordHash,
        role: "PARTICIPANT",
        status: "ACTIVE",
      },
    });

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
