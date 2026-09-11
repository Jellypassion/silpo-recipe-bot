import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import { RecipeSchema, type Recipe } from "./types.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Phase 1: plain LLM call, no tools, no MCP. Turns a dish name into a
 * step-by-step recipe with a shopping-list-shaped ingredient list.
 */
export async function generateRecipe(dishName: string): Promise<Recipe> {
  const response = await client.messages.parse({
    model: config.claudeRecipeModel,
    max_tokens: 4096,
    system:
      "Ти кулінарний асистент. Отримавши назву страви, склади практичний покроковий рецепт " +
      "українською мовою для домашнього приготування та повний список інгредієнтів з кількістю. " +
      "Кількості вказуй так, як зручно купувати в супермаркеті (грами, штуки, літри, упаковки). " +
      "Не додавай сіль/воду/спеції, якщо вони не є визначальними для рецепта, а якщо додаєш — теж вказуй кількість.",
    messages: [
      { role: "user", content: `Страва: ${dishName}` },
    ],
    output_config: {
      format: zodOutputFormat(RecipeSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return a parseable recipe");
  }
  return response.parsed_output;
}
