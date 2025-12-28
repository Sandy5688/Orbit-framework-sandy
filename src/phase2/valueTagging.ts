import { getPrismaClient } from "../db/client";
import { RunProfile } from "./types";

export async function recordValueTags(
  runProfile: RunProfile,
  runId: string
): Promise<void> {
  const prisma = getPrismaClient();
  if (!runProfile.value_tags.length) {
    return;
  }

  await prisma.valueLedgerEntry.create({
    data: {
      profileId: runProfile.profile_id,
      cycleRunId: runId,
      runId,
      valueTags: runProfile.value_tags as any,
      weight: 1.0,
      metadata: {},
    },
  });
}


