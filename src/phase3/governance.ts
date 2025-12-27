import { getPrismaClient } from "../db/client";

export async function isNamespaceHalted(namespace: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const setting = await prisma.governanceSetting.findUnique({
    where: {
      namespace_key: { namespace, key: "halt" },
    },
  });

  if (!setting) {
    return false;
  }

  const value = setting.value as unknown as { halted?: boolean };
  return Boolean(value.halted);
}

export async function haltNamespace(
  namespace: string,
  actor: string
): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.governanceSetting.upsert({
    where: {
      namespace_key: { namespace, key: "halt" },
    },
    create: {
      namespace,
      key: "halt",
      value: { halted: true } as any,
    },
    update: {
      value: { halted: true } as any,
    },
  });

  await prisma.auditTrailEntry.create({
    data: {
      namespace,
      actor,
      action: "halt_namespace",
      details: { reason: "manual_halt" } as any,
    },
  });
}


