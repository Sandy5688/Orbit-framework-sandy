export interface DispatchEndpointConfig {
  key: string;
  url: string;
  method: "POST" | "PUT";
  token?: string;
}

function parseEndpointsEnv(): DispatchEndpointConfig[] {
  const raw = process.env.ORBIT_DISPATCH_ENDPOINTS;
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as DispatchEndpointConfig[];
    return parsed;
  } catch {
    // If config is invalid, we fall back to an empty list and let the
    // dispatcher surface errors when endpoints are missing.
    return [];
  }
}

const endpoints = parseEndpointsEnv();

export const dispatchConfig = {
  all(): DispatchEndpointConfig[] {
    return endpoints;
  },
  get(key: string): DispatchEndpointConfig | undefined {
    return endpoints.find((e) => e.key === key);
  },
};


