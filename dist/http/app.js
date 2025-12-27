"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const orchestrator_1 = require("../phase1/orchestrator");
const client_1 = require("../db/client");
const profileEngine_1 = require("../phase2/profileEngine");
const runProfileOrchestration_1 = require("../phase2/runProfileOrchestration");
const correlationEngine_1 = require("../phase3/correlationEngine");
const strategySuggestion_1 = require("../phase3/strategySuggestion");
const governance_1 = require("../phase3/governance");
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    app.post("/cycles/trigger", async (_req, res) => {
        try {
            const id = await (0, orchestrator_1.runCycle)("manual");
            res.status(202).json({ accepted: true, cycleRunId: id });
        }
        catch (error) {
            res.status(500).json({
                error: "Failed to trigger cycle",
                details: error instanceof Error ? error.message : String(error),
            });
        }
    });
    app.get("/cycles/recent", async (_req, res) => {
        const prisma = (0, client_1.getPrismaClient)();
        const cycles = await prisma.cycleRun.findMany({
            orderBy: { startedAt: "desc" },
            take: 20,
        });
        res.json(cycles);
    });
    app.get("/profiles", (_req, res) => {
        res.json((0, profileEngine_1.loadProfiles)());
    });
    app.get("/run-profiles", (_req, res) => {
        res.json((0, profileEngine_1.loadRunProfiles)());
    });
    app.post("/run-profiles/trigger", async (_req, res) => {
        try {
            await (0, runProfileOrchestration_1.runAllEnabledRunProfilesOnce)();
            res.status(202).json({ accepted: true });
        }
        catch (error) {
            res.status(500).json({
                error: "Failed to trigger run profiles",
                details: error instanceof Error ? error.message : String(error),
            });
        }
    });
    app.post("/profiles/:profileId/signals", async (req, res) => {
        const { profileId } = req.params;
        try {
            await (0, correlationEngine_1.computeAdvisorySignalsForProfile)(profileId);
            res.status(202).json({ accepted: true });
        }
        catch (error) {
            res.status(500).json({
                error: "Failed to compute advisory signals",
                details: error instanceof Error ? error.message : String(error),
            });
        }
    });
    app.post("/profiles/:profileId/strategy-proposals", async (req, res) => {
        const { profileId } = req.params;
        try {
            await (0, strategySuggestion_1.generateStrategyProposalsForProfile)(profileId);
            res.status(202).json({ accepted: true });
        }
        catch (error) {
            res.status(500).json({
                error: "Failed to generate strategy proposals",
                details: error instanceof Error ? error.message : String(error),
            });
        }
    });
    app.post("/governance/namespaces/:namespace/halt", async (req, res) => {
        const { namespace } = req.params;
        const actor = (req.body && req.body.actor) || "api";
        try {
            await (0, governance_1.haltNamespace)(namespace, actor);
            res.status(200).json({ namespace, halted: true });
        }
        catch (error) {
            res.status(500).json({
                error: "Failed to halt namespace",
                details: error instanceof Error ? error.message : String(error),
            });
        }
    });
    return app;
}
