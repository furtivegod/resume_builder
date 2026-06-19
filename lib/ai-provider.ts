import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createFetchWithTimeout } from "@/lib/ai-fetch";

/** Resume generation uses large prompts; allow plenty of time (ms). Override via .env.local */
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 180_000);
/** App-level retries only; SDK retries multiply undici connect timeouts on flaky networks. */
const AI_MAX_RETRIES = Number(process.env.AI_MAX_RETRIES || 1);
const aiFetch = createFetchWithTimeout(AI_REQUEST_TIMEOUT_MS);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  timeout: AI_REQUEST_TIMEOUT_MS,
  maxRetries: 0,
  fetch: aiFetch,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
  timeout: AI_REQUEST_TIMEOUT_MS,
  maxRetries: 0,
  fetch: aiFetch,
});

const deepseekBaseUrl = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1"
).replace(/\/+$/, "");

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: deepseekBaseUrl,
  timeout: AI_REQUEST_TIMEOUT_MS,
  maxRetries: 0,
  fetch: aiFetch,
});

type Provider = "openai" | "anthropic" | "deepseek";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CallAIOptions {
  provider: Provider;
  model?: string;
  messages: AIMessage[];
  temperature?: number;
  max_tokens?: number;
  tryParseJson?: boolean;
}

function stripCodeFences(text: string) {
  let t = String(text || "").trim();
  if (t.startsWith("```json")) t = t.replace(/^```json\n?/, "");
  if (t.startsWith("```")) t = t.replace(/^```\n?/, "");
  if (t.endsWith("```")) t = t.replace(/```$/, "");
  return t.trim();
}

function extractFirstJson(text: string): any | null {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const candidate = objMatch?.[0] || arrMatch?.[0];
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string } };
  return (
    e.name === "APIConnectionTimeoutError" ||
    e.name === "TimeoutError" ||
    e.code === "ETIMEDOUT" ||
    e.cause?.code === "ETIMEDOUT" ||
    /timed out|timeout/i.test(String(e.message || ""))
  );
}

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    name?: string;
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string };
  };
  return (
    isTimeoutError(err) ||
    e.code === "ECONNRESET" ||
    e.code === "ENOTFOUND" ||
    e.cause?.code === "ENOTFOUND" ||
    e.cause?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    e.name === "APIConnectionError"
  );
}

function isConnectTimeout(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    name?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  return (
    e.cause?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    /connect timeout|connection timed out|error sending request/i.test(
      String(e.message || "") + String(e.cause?.message || "")
    )
  );
}

/** User-facing message for AI provider failures. */
export function formatAIProviderError(
  err: unknown,
  provider: Provider,
  elapsedMs?: number
): string {
  if (isTimeoutError(err)) {
    const configuredSec = Math.round(AI_REQUEST_TIMEOUT_MS / 1000);
    const elapsedSec =
      typeof elapsedMs === "number" ? Math.max(1, Math.round(elapsedMs / 1000)) : undefined;

    if (isConnectTimeout(err) || (elapsedSec !== undefined && elapsedSec < configuredSec * 0.5)) {
      const proxyHint =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy
          ? ""
          : " If you use a VPN/local proxy, set HTTPS_PROXY in .env.local (e.g. http://127.0.0.1:3213) and restart the dev server.";
      return (
        `Could not connect to ${provider} (${elapsedSec ?? "unknown"}s elapsed; limit is ${configuredSec}s). ` +
        "This is usually a network/VPN/firewall issue reaching the API, not slow model generation." +
        proxyHint +
        " Try again, switch to Claude in the AI provider dropdown, or check your connection."
      );
    }

    return (
      `${provider} request timed out after ${elapsedSec ?? configuredSec}s (limit ${configuredSec}s). ` +
      "Try again, use a shorter job description, or switch AI model. " +
      "You can raise AI_REQUEST_TIMEOUT_MS in .env.local if needed."
    );
  }

  if (err instanceof Error && err.message.includes("Deepseek DNS lookup failed")) {
    return err.message;
  }

  if (
    err instanceof Error &&
    (/403/.test(err.message) || /forbidden|request not allowed/i.test(err.message))
  ) {
    const proxyHint =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy
        ? " Restart the dev server if you recently changed HTTPS_PROXY."
        : " Set HTTPS_PROXY in .env.local to your local VPN/proxy (e.g. http://127.0.0.1:3213) and restart the dev server.";
    return (
      `${provider} rejected the request (403 forbidden). This often happens when the API is geo-blocked without your system proxy.${proxyHint}`
    );
  }

  if (isNetworkError(err)) {
    return (
      `Could not reach ${provider} (network error). Check your internet connection, ` +
      "VPN/firewall settings, and API key, then try again."
    );
  }

  return err instanceof Error ? err.message : "AI request failed";
}

async function withTimeoutRetry<T>(
  label: string,
  fn: () => Promise<T>,
  extraAttempts = AI_MAX_RETRIES
): Promise<T> {
  let lastError: unknown;
  const attempts = 1 + Math.max(0, extraAttempts);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const elapsedMs = Date.now() - started;
      if (!isTimeoutError(err) || attempt >= attempts) {
        if (isTimeoutError(err)) {
          throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
            elapsedMs,
          });
        }
        throw err;
      }
      console.warn(
        `${label} timed out (attempt ${attempt}/${attempts}, ${Math.round(elapsedMs / 1000)}s), retrying…`
      );
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }

  throw lastError;
}

export function getAIRequestTimeoutMs() {
  return AI_REQUEST_TIMEOUT_MS;
}

export async function callAI(opts: CallAIOptions) {
  const {
    provider,
    model,
    messages,
    temperature = 0.7,
    max_tokens = 1024,
    tryParseJson = false,
  } = opts;

  if (provider === "openai") {
    const modelName = model || process.env.OPENAI_MODEL || "gpt-4o";
    return withTimeoutRetry("OpenAI", async () => {
      const resp = await openai.chat.completions.create({
        model: modelName,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens,
      } as any);

      const text = resp.choices?.[0]?.message?.content || "";
      const json = tryParseJson ? extractFirstJson(String(text)) : null;
      return {
        providerUsed: "openai" as const,
        modelUsed: modelName,
        text: String(text).trim(),
        json,
        raw: resp,
      };
    });
  }

  if (provider === "deepseek") {
    const dsModel = model || process.env.DEEPSEEK_MODEL || "deepseek-v1";
    return withTimeoutRetry("Deepseek", async () => {
      try {
        const raw = await deepseek.chat.completions.create({
          model: dsModel,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature,
          max_tokens,
        } as any);
        const rawAny: any = raw;
        const text =
          rawAny?.choices?.[0]?.message?.content ||
          rawAny?.choices?.[0]?.text ||
          rawAny?.output ||
          JSON.stringify(rawAny);
        const json = tryParseJson ? extractFirstJson(String(text)) : null;
        return {
          providerUsed: "deepseek" as const,
          modelUsed: dsModel,
          text: String(text).trim(),
          json,
          raw,
        };
      } catch (err: any) {
        const causeCode = err?.cause?.code;
        const hostname = err?.cause?.hostname;
        if (causeCode === "ENOTFOUND") {
          throw new Error(
            `Deepseek DNS lookup failed for host "${hostname || "unknown"}". ` +
              `Set DEEPSEEK_BASE_URL in .env.local (recommended: https://api.deepseek.com/v1), ` +
              `then restart the dev server.`
          );
        }
        throw err;
      }
    });
  }

  if (provider === "anthropic") {
    const anthModel = model || process.env.ANTHROPIC_MODEL || "claude-2";
    return withTimeoutRetry("Anthropic", async () => {
      const message = await anthropic.messages.create({
        model: anthModel,
        max_tokens,
        system: [
          {
            type: "text",
            text: messages.find((m) => m.role === "system")?.content || "",
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
        ],
        messages: messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
      } as any);

      const content = message.content?.[0];
      if (!content || content.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }
      const text = content.text || "";
      const json = tryParseJson ? extractFirstJson(String(text)) : null;
      return {
        providerUsed: "anthropic" as const,
        modelUsed: anthModel,
        text: String(text).trim(),
        json,
        raw: message,
      };
    });
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export { extractFirstJson };
