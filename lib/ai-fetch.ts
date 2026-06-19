import { Agent, ProxyAgent, type Dispatcher } from "undici";

function resolveProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    undefined
  );
}

/** Node fetch defaults to a ~10s connect timeout and ignores the Windows system proxy. */
export function createFetchWithTimeout(timeoutMs: number): typeof fetch {
  const ms = Math.max(10_000, timeoutMs);
  const proxyUrl = resolveProxyUrl();

  const dispatcher: Dispatcher = proxyUrl
    ? new ProxyAgent(proxyUrl)
    : new Agent({
        connect: { timeout: ms },
        headersTimeout: ms,
        bodyTimeout: ms,
      });

  return (input, init) =>
    fetch(input, {
      ...init,
      dispatcher,
    } as RequestInit);
}
