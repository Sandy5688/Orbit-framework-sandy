"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesizeInstruction = synthesizeInstruction;
const crypto_1 = __importDefault(require("crypto"));
function synthesizeInstruction(runProfile) {
    const context_blob = JSON.stringify({
        asset_bundle: runProfile.asset_bundle,
        distribution_targets: runProfile.distribution_targets,
    });
    const instruction = {
        instruction_id: crypto_1.default.randomUUID(),
        context_blob,
        constraints: runProfile.execution_policy,
        priority: 0.0,
    };
    return instruction;
}
