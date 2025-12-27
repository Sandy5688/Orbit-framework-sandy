"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNamespaceHalted = isNamespaceHalted;
exports.haltNamespace = haltNamespace;
const client_1 = require("../db/client");
async function isNamespaceHalted(namespace) {
    const prisma = (0, client_1.getPrismaClient)();
    const setting = await prisma.governanceSetting.findUnique({
        where: {
            namespace_key: { namespace, key: "halt" },
        },
    });
    if (!setting) {
        return false;
    }
    const value = setting.value;
    return Boolean(value.halted);
}
async function haltNamespace(namespace, actor) {
    const prisma = (0, client_1.getPrismaClient)();
    await prisma.governanceSetting.upsert({
        where: {
            namespace_key: { namespace, key: "halt" },
        },
        create: {
            namespace,
            key: "halt",
            value: { halted: true },
        },
        update: {
            value: { halted: true },
        },
    });
    await prisma.auditTrailEntry.create({
        data: {
            namespace,
            actor,
            action: "halt_namespace",
            details: { reason: "manual_halt" },
        },
    });
}
