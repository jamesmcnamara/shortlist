import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";

// A plain model ID routes through Vercel AI Gateway, which authenticates with
// AI_GATEWAY_API_KEY when set and the deployment's OIDC token otherwise.
const MODEL = "google/gemini-2.5-flash-lite";

/**
 * Asks the model for an object matching `schema`. Keep untrusted text (user
 * input, scraped pages) in `prompt` and treat the result as untrusted data.
 * Throws if the call fails or the response doesn't match the schema.
 */
export async function generate<T>(
  schema: z.ZodType<T>,
  { instructions, prompt }: { instructions: string; prompt: string },
  model: LanguageModel = MODEL,
): Promise<T> {
  const { output } = await generateText({
    model,
    instructions,
    prompt,
    output: Output.object({ schema }),
    maxOutputTokens: 8_000,
    maxRetries: 1,
    timeout: 30_000,
  });
  return output;
}
