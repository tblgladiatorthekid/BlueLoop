import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { requireRole, ApiError, apiErrorResponse } from "@/lib/auth/rbac";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  password: z.string().min(8).max(200),
  role: z.enum(["OPERATOR", "RECYCLER", "ADMIN"]),
  // Required and mutually exclusive depending on role — an OPERATOR needs a
  // collection point to be scoped to, a RECYCLER needs an organization.
  collectionPointId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
});

/**
 * Admin-only account provisioning. This is the deliberate counterpart to
 * /api/auth/register always creating a PARTICIPANT — any role with real
 * authority (verifying collections, confirming transfers, configuring
 * reward rates) is provisioned here, not self-service.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(req, ["ADMIN"]);
    const body = bodySchema.parse(await req.json());

    if (body.role === "OPERATOR" && !body.collectionPointId) {
      throw new ApiError(400, "MISSING_SCOPE", "collectionPointId is required when role is OPERATOR.");
    }
    if (body.role === "RECYCLER" && !body.organizationId) {
      throw new ApiError(400, "MISSING_SCOPE", "organizationId is required when role is RECYCLER.");
    }

    const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (existing) {
      throw new ApiError(409, "PHONE_ALREADY_REGISTERED", "An account with this phone number already exists.");
    }

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: body.name, phone: body.phone, passwordHash, role: body.role, status: "ACTIVE" },
      });

      if (body.role === "OPERATOR" && body.collectionPointId) {
        await tx.collectionPointOperator.create({
          data: { userId: created.id, collectionPointId: body.collectionPointId },
        });
      }
      if (body.role === "RECYCLER" && body.organizationId) {
        await tx.organizationMember.create({
          data: { userId: created.id, organizationId: body.organizationId },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: session.sub,
          action: "STAFF_ACCOUNT_CREATED",
          entityType: "User",
          entityId: created.id,
          afterState: { role: body.role, phone: body.phone },
        },
      });

      return created;
    });

    return NextResponse.json(
      { user: { id: user.id, name: user.name, phone: user.phone, role: user.role } },
      { status: 201 }
    );
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
