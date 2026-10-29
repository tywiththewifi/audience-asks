import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const MODELS = {
  sort: process.env.SORT_MODEL ?? "claude-haiku-5-5",
  group: process.env.GROUP_MODEL ?? "claude-opus-5-5",
  ideas: process.env.IDEAS_MODEL ?? "claude-opus-5-5",
};

/** USD per million tokens [input, output]. Update when models change. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};

export class LLMError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export class Meter {
  costUsd = 0;
  inputTokens = 0;
  outputTokens = 0;
  calls = 0;

  add(model: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }) {
    const [inp, out] = PRICES[model] ?? [4, 20];
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    this.calls += 1;
    this.inputTokens += usage.input_tokens + cacheRead;
    this.outputTokens += usage.output_tokens;
    this.costUsd += (usage.input_tokens * inp + cacheRead * inp * 0.1 + usage.output_tokens * out) / 1_000_000;
  }
}

let client: Anthropic | undefined;
function getClient() {
  const apiKey = process.env.AUDIENCE_ASKS_ANTHROPIC_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LLMError("No Anthropic API key is set on the server (ANTHROPIC_API_KEY).", false);
  // AUDIENCE_ASKS_ANTHROPIC_KEY exists because some hosts (Claude Code cloud) reserve ANTHROPIC_API_KEY.
  client ??= new Anthropic({ apiKey, maxRetries: 3 });
  return client;
}

export type Effort = "low" | "medium" | "high";

/**
 * One structured call: the response must match `schema` (enforced by the API and re-checked by zod).
 * Refusals, truncation and parse failures become LLMErrors so the pipeline can label the step.
 */
export async function structured<S extends z.ZodType>(opts: {
  model: string;
  system: string;
  user: string;
  schema: S;
  effort: Effort;
  maxTokens?: number;
  meter: Meter;
}): Promise<z.infer<S>> {
  const client = getClient();
  let response;
  try {
    response = await client.messages.parse({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      output_config: { effort: opts.effort, format: zodOutputFormat(opts.schema) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new LLMError("The Anthropic API key is missing or invalid.", false);
    if (err instanceof Anthropic.RateLimitError) throw new LLMError("Rate limited by the Anthropic API. Try again in a minute.", true);
    if (err instanceof Anthropic.BadRequestError) throw new LLMError(`The model rejected the request: ${err.message}`, false);
    if (err instanceof Anthropic.APIError) throw new LLMError(`Anthropic API error: ${err.message}`, true);
    throw err;
  }

  opts.meter.add(opts.model, response.usage);
  if (response.stop_reason === "refusal") throw new LLMError("The model declined this batch.", true);
  if (response.stop_reason === "max_tokens") throw new LLMError("The model ran out of room before finishing.", true);
  if (!response.parsed_output) throw new LLMError("The model's answer didn't match the expected shape.", true);
  return response.parsed_output;
}
