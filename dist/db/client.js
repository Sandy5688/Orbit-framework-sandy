"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrismaClient = getPrismaClient;
const client_1 = require("../generated/prisma/client");
const logger_1 = require("../shared/logger");
let prisma;
function getPrismaClient() {
    if (!prisma) {
        logger_1.logger.info("Initializing Prisma client");
        prisma = new client_1.PrismaClient();
    }
    return prisma;
}
