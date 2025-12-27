import { getPrismaClient } from "../db/client";
import { logger } from "../shared/logger";

type Scope =
  | "cycle"
  | "initiation"
  | "transformation"
  | "normalization"
  | "dispatch"
  | "governance";

type Level = "info" | "warning" | "error";

async function record(
  scope: Scope,
  level: Level,
  message: string,
  refId?: string,
  cycleRunId?: string,
  details?: unknown
): Promise<void> {
  const prisma = getPrismaClient();
  try {
    await prisma.executionRecord.create({
      data: {
        scope,
        level,
        message,
        refId,
        cycleRunId,
        details: details as any,
      },
    });
  } catch (error) {
    logger.error("Failed to persist execution record", { error });
  }
}

export const recorder = {
  info: (
    scope: Scope,
    message: string,
    refId?: string,
    cycleRunId?: string,
    details?: unknown
  ) => record(scope, "info", message, refId, cycleRunId, details),
  warn: (
    scope: Scope,
    message: string,
    refId?: string,
    cycleRunId?: string,
    details?: unknown
  ) => record(scope, "warning", message, refId, cycleRunId, details),
  error: (
    scope: Scope,
    message: string,
    refId?: string,
    cycleRunId?: string,
    details?: unknown
  ) => record(scope, "error", message, refId, cycleRunId, details),
};


