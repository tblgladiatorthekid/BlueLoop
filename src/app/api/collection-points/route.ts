import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, apiErrorResponse } from "@/lib/auth/rbac";

/** Discovery — any logged-in user (participant looking for a drop-off point,
 * operator, admin, etc). Only ACTIVE points are returned by default so a
 * participant never gets routed to a point that isn't actually open yet. */
export async function GET(req: NextRequest) {
  try {
    await requireSession(req);

    const locationId = req.nextUrl.searchParams.get("location_id") ?? undefined;
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") === "true";

    const points = await prisma.collectionPoint.findMany({
      where: {
        ...(locationId ? { locationId } : {}),
        ...(includeInactive ? {} : { status: "ACTIVE" }),
      },
      include: {
        acceptedMaterials: { include: { wasteCategory: { select: { name: true, code: true } } } },
        location: { select: { name: true, region: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      collectionPoints: points.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        latitude: p.latitude,
        longitude: p.longitude,
        address: p.address,
        operatingHours: p.operatingHours,
        location: p.location,
        acceptedMaterials: p.acceptedMaterials.map((m) => m.wasteCategory),
      })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const createSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().trim().min(2).max(160),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().trim().max(300).optional(),
  operatingHours: z.string().trim().max(200).optional(),
  acceptedWasteCategoryIds: z.array(z.string()).min(1),
});

/** Admin-only. New points are created PENDING by default (schema default) —
 * an admin still has to flip them ACTIVE, mirroring the approval flow in
 * the PRD rather than silently going live. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(req, ["ADMIN"]);
    const body = createSchema.parse(await req.json());

    const point = await prisma.collectionPoint.create({
      data: {
        locationId: body.locationId,
        name: body.name,
        latitude: body.latitude,
        longitude: body.longitude,
        address: body.address,
        operatingHours: body.operatingHours,
        acceptedMaterials: {
          create: body.acceptedWasteCategoryIds.map((wasteCategoryId) => ({ wasteCategoryId })),
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.sub,
        action: "COLLECTION_POINT_CREATED",
        entityType: "CollectionPoint",
        entityId: point.id,
        afterState: { name: point.name, status: point.status },
      },
    });

    return NextResponse.json({ collectionPoint: point }, { status: 201 });
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
