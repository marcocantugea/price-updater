export interface MockRequestInput {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  method?: string;
  originalUrl?: string;
  ip?: string;
  [key: string]: any;
}

/** Minimal Express request double. */
export function mockRequest(input: MockRequestInput = {}): any {
  const { headers = {}, ...overrides } = input;
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) normalized[key.toLowerCase()] = value;

  const req: any = { ...overrides };
  req.headers = normalized;
  req.cookies = overrides.cookies ?? {};
  req.body = overrides.body ?? {};
  req.params = overrides.params ?? {};
  req.query = overrides.query ?? {};
  req.method = overrides.method ?? 'GET';
  req.originalUrl = overrides.originalUrl ?? '/';
  req.url = req.originalUrl;
  req.ip = overrides.ip ?? '127.0.0.1';
  req.header = (name: string) => normalized[String(name).toLowerCase()];
  return req;
}

/** Minimal Express response double capturing status/json/send. */
export function mockResponse(): any {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload: any) => {
    res.body = payload;
    return res;
  });
  res.send = jest.fn((payload: any) => {
    res.body = payload;
    return res;
  });
  res.setHeader = jest.fn();
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Runs a middleware/handler and resolves when it either calls `next()` (with
 * the error, if any) or finalizes the response through json/send.
 */
export function runHandler(handler: any, req: any, res: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (value: unknown) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const originalJson = res.json;
    res.json = (payload: any) => {
      const result = originalJson(payload);
      done(undefined);
      return result;
    };

    const originalSend = res.send;
    res.send = (payload: any) => {
      const result = originalSend(payload);
      done(undefined);
      return result;
    };

    try {
      const result = handler(req, res, (error?: unknown) => done(error));
      if (result && typeof result.then === 'function') {
        result.then(() => done(undefined)).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}
