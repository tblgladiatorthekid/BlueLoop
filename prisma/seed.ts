/**
 * Seed data for BlueLoop demo/development use.
 *
 * IMPORTANT — before any real pilot use:
 *  - Replace the placeholder recycling partner with a real, onboarded organization.
 *  - Re-check the PET, HDPE, and aluminum rates close to launch — they're grounded
 *    in real reporting but Lagos scrap/recyclables prices move with commodity
 *    markets and the naira rate.
 *  - Delete or clearly separate the dummy participants/collections — they exist
 *    only to make the demo flow show non-empty screens.
 *  - Every seeded account shares one demo password (see DEMO_PASSWORD below).
 *    Rotate real credentials before this touches a real device in the field.
 */

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

const SYSTEM_ACTOR = "seed-script"; // stand-in "createdBy"/"actorId" for seeded config rows

// Every seeded demo account uses this password. Fine for a hackathon/local
// dev seed; never reuse a shared password like this for anything real.
const DEMO_PASSWORD = "BlueLoop2026!";

async function main() {
  // --- Location ---------------------------------------------------------
  const eleko = await prisma.location.create({
    data: {
      name: "Eleko Beach",
      region: "Lagos",
      country: "Nigeria",
      latitude: 6.4698,
      longitude: 3.9796,
      status: "ACTIVE",
    },
  });

  // --- Waste categories ---------------------------------------------------
  const categories = await Promise.all(
    [
      { name: "PET Bottles", code: "PET", isRecyclable: true },
      { name: "HDPE", code: "HDPE", isRecyclable: true },
      { name: "Plastic Bags / Nylon", code: "NYLON", isRecyclable: true },
      { name: "Food Packaging", code: "FOOD_PKG", isRecyclable: true },
      { name: "Fishing-Related Plastics", code: "FISHING_PLASTIC", isRecyclable: true },
      { name: "Aluminum (Cans)", code: "ALU_CAN", isRecyclable: true },
      { name: "Other Recyclable", code: "OTHER_RECYCLABLE", isRecyclable: true },
      { name: "Non-Recyclable", code: "NON_RECYCLABLE", isRecyclable: false },
      // Named in the value proposition but intentionally INACTIVE and with no reward
      // rate until a buyer is confirmed (see AGENTS.md). Activate via admin/data, not code.
      { name: "Metal Scrap (Wire / Mesh)", code: "METAL_MESH", isRecyclable: true, active: false },
      { name: "Polystyrene (Styrofoam)", code: "EPS", isRecyclable: true, active: false },
    ].map((c) => prisma.wasteCategory.create({ data: c }))
  );
  const byCode = Object.fromEntries(categories.map((c) => [c.code, c]));

  // --- BBC <-> NGN conversion peg -----------------------------------------
  await prisma.bbcConversionRate.create({
    data: {
      ngnPerBbc: 0.45,
      createdBy: SYSTEM_ACTOR,
      note: "Pilot peg confirmed for Eleko Beach launch. Redemption/cash-out itself is not implemented in the MVP.",
    },
  });

  // --- Reward rates ---------------------------------------------------
  // PET and Aluminum: grounded in reported Lagos market figures.
  // HDPE: explicitly unverified placeholder.
  // Everything else: illustrative dummy values for demo purposes only.
  await prisma.rewardRate.createMany({
    data: [
      {
        wasteCategoryId: byCode.PET.id,
        ratePerKgBbc: 267, // ~NGN120/kg / 0.45
        createdBy: SYSTEM_ACTOR,
        sourceNote:
          "Pilot payout benchmarked to Ecobarter's quoted ~NGN120/kg for bottles (team notes; UNVERIFIED, re-check). Deliberately well below the NGN520-620/kg Lagos recyclers pay for clean PET (Nairametrics, Jul 2025) so the platform keeps a margin to fund operations. Admin can change this live via /api/admin/reward-rates.",
      },
      {
        wasteCategoryId: byCode.ALU_CAN.id,
        ratePerKgBbc: 800, // ~NGN360/kg / 0.45
        createdBy: SYSTEM_ACTOR,
        sourceNote:
          "Pilot payout benchmarked to Ecobarter's quoted ~NGN360/kg for cans (team notes; UNVERIFIED, re-check). Lagos scrap buyers quote aluminum at NGN1,800-3,000/kg (V-Martins Recycling, Apr 2026), so this leaves a wide margin. Admin can change this live.",
      },
      {
        wasteCategoryId: byCode.HDPE.id,
        ratePerKgBbc: 267, // ~NGN120/kg / 0.45
        createdBy: SYSTEM_ACTOR,
        sourceNote:
          "ASSUMPTION: set equal to the PET payout, using Ecobarter's general plastic rate as the benchmark (no HDPE-specific competitor figure). Lagos collectors report HDPE buy-in of NGN300-350/kg (Nairametrics, Jul 2025). Re-verify.",
      },
      {
        wasteCategoryId: byCode.NYLON.id,
        ratePerKgBbc: 50,
        createdBy: SYSTEM_ACTOR,
        sourceNote: "DUMMY VALUE for demo purposes only — not researched.",
      },
      {
        wasteCategoryId: byCode.FOOD_PKG.id,
        ratePerKgBbc: 40,
        createdBy: SYSTEM_ACTOR,
        sourceNote: "DUMMY VALUE for demo purposes only — not researched.",
      },
      {
        wasteCategoryId: byCode.FISHING_PLASTIC.id,
        ratePerKgBbc: 60,
        createdBy: SYSTEM_ACTOR,
        sourceNote: "DUMMY VALUE for demo purposes only — not researched.",
      },
      {
        wasteCategoryId: byCode.OTHER_RECYCLABLE.id,
        ratePerKgBbc: 30,
        createdBy: SYSTEM_ACTOR,
        sourceNote: "DUMMY VALUE for demo purposes only — not researched.",
      },
      {
        wasteCategoryId: byCode.NON_RECYCLABLE.id,
        ratePerKgBbc: 0,
        createdBy: SYSTEM_ACTOR,
        sourceNote: "No reward by design — logged for volume tracking only.",
      },
    ],
  });

  // --- Placeholder recycling partner (clearly labeled, per pilot decision) ---
  const placeholderPartner = await prisma.organization.create({
    data: {
      name: "DEMO — Placeholder Recycling Partner (not a real partner)",
      type: "RECYCLING_PARTNER",
      contactInfo: "placeholder@example.invalid",
      status: "ACTIVE",
      isPlaceholder: true,
      acceptedMaterials: {
        create: [
          { wasteCategoryId: byCode.PET.id },
          { wasteCategoryId: byCode.HDPE.id },
          { wasteCategoryId: byCode.ALU_CAN.id },
        ],
      },
    },
  });

  // --- Demo collection point + operator + participants (dummy demo data) ---
  const collectionPoint = await prisma.collectionPoint.create({
    data: {
      locationId: eleko.id,
      name: "Eleko Beach Collection Point (Demo)",
      latitude: 6.4701,
      longitude: 3.98,
      address: "Eleko Beach access road, Lagos",
      status: "ACTIVE",
      acceptedMaterials: {
        create: [
          { wasteCategoryId: byCode.PET.id },
          { wasteCategoryId: byCode.HDPE.id },
          { wasteCategoryId: byCode.ALU_CAN.id },
          { wasteCategoryId: byCode.NYLON.id },
        ],
      },
    },
  });

  const demoPasswordHash = await hashPassword(DEMO_PASSWORD);

  const operator = await prisma.user.create({
    data: {
      name: "Demo Operator",
      phone: "+2340000000001",
      passwordHash: demoPasswordHash,
      role: "OPERATOR",
      status: "ACTIVE",
      operatorLinks: { create: [{ collectionPointId: collectionPoint.id, status: "ACTIVE" }] },
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: "Demo Admin",
      phone: "+2340000000002",
      passwordHash: demoPasswordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const participant = await prisma.user.create({
    data: {
      name: "Demo Participant",
      phone: "+2340000000003",
      passwordHash: demoPasswordHash,
      role: "PARTICIPANT",
      status: "ACTIVE",
    },
  });

  const recycler = await prisma.user.create({
    data: {
      name: "Demo Recycler",
      phone: "+2340000000004",
      passwordHash: demoPasswordHash,
      role: "RECYCLER",
      status: "ACTIVE",
      organizationLinks: { create: [{ organizationId: placeholderPartner.id, status: "ACTIVE" }] },
    },
  });

  console.log("Seed complete:", {
    location: eleko.name,
    categories: categories.length,
    collectionPoint: collectionPoint.name,
    placeholderPartner: placeholderPartner.name,
    demoUsers: [operator.phone, admin.phone, participant.phone, recycler.phone],
    demoPassword: DEMO_PASSWORD,
  });
  console.log(
    "NOTE: no demo collections/reward transactions were pre-seeded — run the verify flow live during the demo so judges see the real reward engine execute, not a fabricated result."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
