"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordValueTags = recordValueTags;
const client_1 = require("../db/client");
async function recordValueTags(runProfile, runId) {
    const prisma = (0, client_1.getPrismaClient)();
    if (!runProfile.value_tags.length) {
        return;
    }
    await prisma.valueLedgerEntry.create({
        data: {
            profileId: runProfile.profile_id,
            runId,
            valueTags: runProfile.value_tags,
            weight: 1.0,
            metadata: {},
        },
    });
}
