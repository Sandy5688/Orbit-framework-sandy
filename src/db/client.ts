import { PrismaClient } from "../generated/prisma/client";
import { logger } from "../shared/logger";

let prisma: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    logger.info("Initializing Prisma client");
    prisma = new (PrismaClient as unknown as { new (): PrismaClient })();
  }
  return prisma;
}


