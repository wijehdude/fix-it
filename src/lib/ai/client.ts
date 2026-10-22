import "server-only";
import OpenAI, { APIError } from "openai";
import type { z } from "zod";
import type { ApiErrorCode } from "@/lib/api/contracts";

export const DEFAULT_CHAT_MODEL = "gpt-5.4-mini";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
/** Embedding dimensions requested from the API (smaller = less data shipped to the browser). */
export const EMBEDDING_DIMENSIONS = 512;

export class AiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public publicMessage: string,
    public status?: number,
  ) {
    super(publicMessage);
  }
}

let client: OpenAI | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function chatModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_CHAT_MODEL;
}

export function embeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiError("NOT_CONFIGURED", "The OpenAI API key is not configured on the server.");
  if (!client) client = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 1 });
  return client;
}

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof APIError) {
    if (err.status === 429) return new AiError("UPSTREAM_RATE_LIMITED", "OpenAI rate limit reached. Retrying shortly.", 429);
    if (err.status === 401) return new AiError("NOT_CONFIGURED", "The OpenAI API key was rejected.", 401);
    return new AiError("UPSTREAM_ERROR", "The AI service returned an error.", err.status);
  }
  return new AiError("UPSTREAM_ERROR", "The AI service could not be reached.");
}

/** Optional parameters that some models reject; dropped (and remembered) on a 400 that names them. */
type OptionalParam = "temperature" | "reasoning_effort";
const unsupported = new Map<string, Set<OptionalParam>>();

function rejectedParam(err: unknown): OptionalParam | null {
  if (!(err instanceof APIError) || err.status !== 400) return null;
  const text = `${err.message} ${JSON.stringify(err.error ?? {})}`.toLowerCase();
  if (text.includes("temperature")) return "temperature";
  if (text.includes("reasoning_effort") || text.includes("reasoning.effort")) return "reasoning_effort";
  return null;
}

export type StrictJsonSchema = Record<string, unknown>;

/**
 * Calls the chat model with Structured Outputs (strict JSON schema) and temperature 0,
 * then validates the result with Zod. Falls back gracefully for models that do not accept
 * temperature or reasoning_effort.
 */
export async function callStructured<T>(opts: {
  name: string;
  system: string;
  user: string;
  jsonSchema: StrictJsonSchema;
  validator: z.ZodType<T>;
  maxTokens?: number;
}): Promise<T> {
  const openai = getClient();
  const model = chatModel();
  const skip = unsupported.get(model) ?? new Set<OptionalParam>();
  const effort = process.env.OPENAI_REASONING_EFFORT || "low";

  for (let attempt = 0; attempt < 3; attempt++) {
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.name, strict: true, schema: opts.jsonSchema },
      },
      max_completion_tokens: opts.maxTokens ?? 8000,
    };
    if (!skip.has("temperature")) params.temperature = 0;
    if (!skip.has("reasoning_effort") && effort !== "default") {
      params.reasoning_effort = effort as OpenAI.ReasoningEffort;
    }
    try {
      const res = await openai.chat.completions.create(params);
      const msg = res.choices[0]?.message;
      if (msg?.refusal) throw new AiError("INVALID_AI_RESPONSE", "The AI model declined to process this batch.");
      if (!msg?.content) throw new AiError("INVALID_AI_RESPONSE", "The AI model returned an empty response.");
      let json: unknown;
      try {
        json = JSON.parse(msg.content);
      } catch {
        throw new AiError("INVALID_AI_RESPONSE", "The AI model returned malformed JSON.");
      }
      const parsed = opts.validator.safeParse(json);
      if (!parsed.success) throw new AiError("INVALID_AI_RESPONSE", "The AI response did not match the expected schema.");
      return parsed.data;
    } catch (err) {
      const param = rejectedParam(err);
      if (param && !skip.has(param)) {
        skip.add(param);
        unsupported.set(model, skip);
        continue;
      }
      throw toAiError(err);
    }
  }
  throw new AiError("UPSTREAM_ERROR", "The AI service rejected the request parameters.");
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const openai = getClient();
  try {
    const res = await openai.embeddings.create({
      model: embeddingModel(),
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    });
    const out = res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (out.length !== texts.length) throw new AiError("INVALID_AI_RESPONSE", "Embedding count mismatch.");
    // Round to 5 dp to keep responses small.
    return out.map((v) => v.map((x) => Math.round(x * 1e5) / 1e5));
  } catch (err) {
    throw toAiError(err);
  }
}
