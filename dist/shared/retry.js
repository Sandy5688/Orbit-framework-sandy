"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = withRetry;
async function withRetry(operation, options) {
    const { maxAttempts, baseDelayMs } = options;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        attempt += 1;
        try {
            return await operation();
        }
        catch (error) {
            if (attempt >= maxAttempts) {
                throw error;
            }
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}
