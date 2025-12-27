import { getPrismaClient } from "../db/client";

export async function generateStrategyProposalsForProfile(
  profileId: string
): Promise<void> {
  const prisma = getPrismaClient();

  const signals = await prisma.advisorySignal.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (!signals.length) {
    return;
  }

  const latest = signals[0];

  await prisma.strategyProposal.create({
    data: {
      profileId,
      signalId: latest.id,
      description: `Strategy proposal based on signal '${latest.signal}'`,
      suggestedChange: {
        recommendation: latest.recommendation,
      } as any,
      status: "pending",
    },
  });
}


