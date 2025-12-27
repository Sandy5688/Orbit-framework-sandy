"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function log(level, message, meta) {
    const timestamp = new Date().toISOString();
    // Keep logging simple and structured for now.
    if (meta !== undefined) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ timestamp, level, message, meta }));
    }
    else {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ timestamp, level, message }));
    }
}
exports.logger = {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),
};
