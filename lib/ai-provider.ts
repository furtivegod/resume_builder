import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
// Deepseek exposes an OpenAI-compatible API. Allow base URL override via env.
const deepseekBaseUrl =
  (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: deepseekBaseUrl,
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
  // when true try to parse JSON out of the response
  tryParseJson?: boolean;
}

// strip markdown fences and surrounding text to help JSON parsing
function stripCodeFences(text: string) {
  let t = String(text || "");
  // remove leading/trailing whitespace
  t = t.trim();
  // Remove ```json or ```
  if (t.startsWith("```json")) t = t.replace(/^```json\n?/, "");
  if (t.startsWith("```")) t = t.replace(/^```\n?/, "");
  if (t.endsWith("```")) t = t.replace(/```$/, "");
  return t.trim();
}

// Try to extract the first JSON object/array from a string
function extractFirstJson(text: string): any | null {
  const cleaned = stripCodeFences(text);
  // quick attempt: parse the whole thing
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // fallback: find first {...} or [...] substring and try to parse
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const candidate = objMatch?.[0] || arrMatch?.[0];
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch (e2) {
      return null;
    }
  }
}

export async function callAI(opts: CallAIOptions) {
  const { provider, model, messages, temperature = 0.7, max_tokens = 1024, tryParseJson = false } = opts;

  if (provider === "openai") {
    // Try the single model provided. The caller can decide on fallbacks.
    try {
      const resp = await openai.chat.completions.create({
        model: model || process.env.OPENAI_MODEL || "gpt-4o",
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens,
      } as any);

      const text = resp.choices?.[0]?.message?.content || "";
      const raw = resp;
      const json = tryParseJson ? extractFirstJson(String(text)) : null;
      return {
        providerUsed: "openai" as const,
        modelUsed: model || process.env.OPENAI_MODEL || "gpt-4o",
        text: String(text).trim(),
        json,
        raw,
      };
    } catch (err) {
      throw err;
    }
  }

  if (provider === "deepseek") {
    try {
      const dsModel = model || process.env.DEEPSEEK_MODEL || "deepseek-v1";
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
  }

  // anthropic
  if (provider === "anthropic") {
    try {
      const anthModel = model || process.env.ANTHROPIC_MODEL || "claude-2";
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
        messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
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
    } catch (err) {
      throw err;
    }
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export { extractFirstJson };
