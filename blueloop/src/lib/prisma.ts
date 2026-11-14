import { PrismaClient } from "@prisma/client";

// Next.js dev mode hot-reloads modules on every save. Without this guard,
// each reload would create a fresh PrismaClient (and a fresh pool of DB
// connections) without ever closing the old one. Stashing the instance on
// `globalThis` survives the reload so we reuse one client instead.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
