"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchConfig = void 0;
function parseEndpointsEnv() {
    const raw = process.env.ORBIT_DISPATCH_ENDPOINTS;
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch {
        // If config is invalid, we fall back to an empty list and let the
        // dispatcher surface errors when endpoints are missing.
        return [];
    }
}
const endpoints = parseEndpointsEnv();
exports.dispatchConfig = {
    all() {
        return endpoints;
    },
    get(key) {
        return endpoints.find((e) => e.key === key);
    },
};
