import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ApiError, apiErrorResponse } from "@/lib/auth/rbac";
import { detectAnomalies } from "@/lib/fraud/anomaly";

const createSchema = z.object({
  collectionPointId: z.string().min(1),
  wasteCategoryId: z.string().min(1),
  submittedWeightKg: z.number().positive().max(1000), // 1000kg sanity ceiling — a real anomaly, not a hard fraud rule
  notes: z.string().trim().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  // Client-generated (e.g. a UUID made at submit-time), sent unchanged on
  // retry. Lets a flaky-connection retry land safely on the unique
  // constraint instead of creating a duplicate submission.
  idempotencyKey: z.string().min(8).max(128),
});

/**
 * Participant submits a collection for verification. This only ever creates
 * a PENDING record — no reward is calculated here. That happens exclusively
 * in verifyCollectionAndReward() when an operator confirms it, so a
 * participant can never self-report their way to a reward.
 */
export async function POST(req: NextRequest) {
  let idempotencyKeyForRaceFallback: string | undefined;
  try {
    const session = await requireRole(req, ["PARTICIPANT"]);
    const body = createSchema.parse(await req.json());
    idempotencyKeyForRaceFallback = body.idempotencyKey;

    // Idempotent retry: if this key was already used, return the existing
    // record instead of erroring, so a client retrying after a dropped
    // response doesn't need special-case handling.
    const existing = await prisma.collection.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
    if (existing) {
      if (existing.participantId !== session.sub) {
        throw new ApiError(409, "IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was already used by a different account.");
      }
      return NextResponse.json({ collection: existing }, { status: 200 });
    }

    const point = await prisma.collectionPoint.findUnique({
      where: { id: body.collectionPointId },
      include: { acceptedMaterials: true },
    });
    if (!point || point.status !== "ACTIVE") {
      throw new ApiError(400, "COLLECTION_POINT_UNAVAILABLE", "This collection point is not currently active.");
    }
    const materialAccepted = point.acceptedMaterials.some((m) => m.wasteCategoryId === body.wasteCategoryId);
    if (!materialAccepted) {
      throw new ApiError(400, "MATERIAL_NOT_ACCEPTED", "This collection point does not accept this material type.");
    }

    // Flag (never block) unusual submissions so an operator/admin can look closer.
    const now = new Date();
    const recent = await prisma.collection.findMany({
      where: { participantId: session.sub, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      select: { createdAt: true, collectionPointId: true, wasteCategoryId: true, submittedWeightKg: true },
    });
    const anomalies = detectAnomalies({
      now,
      collectionPointId: body.collectionPointId,
      wasteCategoryId: body.wasteCategoryId,
      submittedWeightKg: body.submittedWeightKg,
      recent: recent.map((r) => ({ ...r, submittedWeightKg: Number(r.submittedWeightKg) })),
    });

    const collection = await prisma.collection.create({
      data: {
        flagged: anomalies.length > 0,
        flagReason: anomalies.length > 0 ? anomalies.join(", ") : null,
        idempotencyKey: body.idempotencyKey,
        participantId: session.sub,
        collectionPointId: body.collectionPointId,
        wasteCategoryId: body.wasteCategoryId,
        submittedWeightKg: body.submittedWeightKg,
        notes: body.notes,
        latitude: body.latitude,
        longitude: body.longitude,
      },
    });

    return NextResponse.json({ collection }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid input.", issues: err.issues },
        { status: 400 }
      );
    }
    // Unique constraint race (two requests with the same idempotency key
    // landing concurrently) — treat it the same as the pre-check above.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002" && idempotencyKeyForRaceFallback) {
      const existing = await prisma.collection.findUnique({
        where: { idempotencyKey: idempotencyKeyForRaceFallback },
      });
      if (existing) return NextResponse.json({ collection: existing }, { status: 200 });
    }
    return apiErrorResponse(err);
  }
}

/**
 * Operator/admin review queue. Operators only ever see collections at points
 * they are scoped to; participant phone numbers are masked (the operator
 * identifies people by name plus last four digits, not a full number).
 * Query: collection_point_id (required for operators), status (default
 * PENDING), flagged=true to show only anomaly-flagged items.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(req, ["OPERATOR", "ADMIN"]);
    const params = req.nextUrl.searchParams;
    const collectionPointId = params.get("collection_point_id") ?? undefined;
    const status = (params.get("status") ?? "PENDING") as "PENDING" | "VERIFIED" | "REJECTED" | "CANCELLED";
    const flaggedOnly = params.get("flagged") === "true";

    if (session.role === "OPERATOR") {
      if (!collectionPointId) {
        throw new ApiError(400, "MISSING_PARAM", "collection_point_id is required.");
      }
      const isScoped = await prisma.collectionPointOperator.findFirst({
        where: { userId: session.sub, collectionPointId, status: "ACTIVE" },
      });
      if (!isScoped) {
        throw new ApiError(403, "OPERATOR_NOT_SCOPED", "You are not authorized at this collection point.");
      }
    }

    const collections = await prisma.collection.findMany({
      where: { status, ...(collectionPointId ? { collectionPointId } : {}), ...(flaggedOnly ? { flagged: true } : {}) },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        participant: { select: { name: true, phone: true } },
        wasteCategory: { select: { name: true, code: true } },
      },
    });

    return NextResponse.json({
      collections: collections.map((c) => ({
        id: c.id,
        status: c.status,
        participantName: c.participant.name,
        participantPhoneLast4: c.participant.phone.slice(-4),
        wasteCategory: c.wasteCategory,
        submittedWeightKg: Number(c.submittedWeightKg),
        flagged: c.flagged,
        flagReason: c.flagReason,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
