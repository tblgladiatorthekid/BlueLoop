import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, apiErrorResponse } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await requireSession(req);
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") === "true";

    const orgs = await prisma.organization.findMany({
      where: includeInactive ? {} : { status: "ACTIVE" },
      include: { acceptedMaterials: { include: { wasteCategory: { select: { name: true, code: true } } } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      organizations: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        status: o.status,
        isPlaceholder: o.isPlaceholder,
        acceptedMaterials: o.acceptedMaterials.map((m) => m.wasteCategory),
      })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(["RECYCLING_PARTNER", "SPONSOR"]),
  contactInfo: z.string().trim().max(300).optional(),
  acceptedWasteCategoryIds: z.array(z.string()).default([]),
});

/** Admin-only. Created PENDING by default — a partner isn't visible for
 * transfers until an admin approves it (mirrors collection-point approval). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(req, ["ADMIN"]);
    const body = createSchema.parse(await req.json());

    const org = await prisma.organization.create({
      data: {
        name: body.name,
        type: body.type,
        contactInfo: body.contactInfo,
        acceptedMaterials: { create: body.acceptedWasteCategoryIds.map((wasteCategoryId) => ({ wasteCategoryId })) },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.sub,
        action: "ORGANIZATION_CREATED",
        entityType: "Organization",
        entityId: org.id,
        afterState: { name: org.name, status: org.status },
      },
    });

    return NextResponse.json({ organization: org }, { status: 201 });
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
