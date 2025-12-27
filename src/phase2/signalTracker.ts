import { getPrismaClient } from "../db/client";
import { RunProfile } from "./types";

export interface ExecutionSignal {
  executions: number;
  deliveries: number;
}

export async function trackExecutionSignal(
  runProfile: RunProfile,
  cycleRunId: string
): Promise<void> {
  const prisma = getPrismaClient();

  const deliveries = await prisma.dispatchJob.count({
    where: {
      status: "delivered",
    },
  });

  await prisma.governanceSetting.upsert({
    where: {
      namespace_key: {
        namespace: runProfile.namespace,
        key: `signal:${runProfile.run_profile_id}`,
      },
    },
    create: {
      namespace: runProfile.namespace,
      key: `signal:${runProfile.run_profile_id}`,
      value: {
        executions: { connect: { id: cycleRunId } },
        deliveries,
      } as any,
    },
    update: {
      value: {
        executions: { connect: { id: cycleRunId } },
        deliveries,
      } as any,
    },
  });
}


