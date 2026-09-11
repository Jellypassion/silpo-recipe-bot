import { z } from "zod";

export const IngredientSchema = z.object({
  name: z.string().describe("Назва інгредієнта українською, як шукати в магазині"),
  quantity: z.string().describe("Кількість з одиницею виміру, напр. '400 г', '2 шт', '1 л'"),
  notes: z.string().optional().describe("Необов'язкове уточнення, напр. 'за бажанням', 'сорт'"),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const RecipeSchema = z.object({
  title: z.string().describe("Назва страви"),
  servings: z.string().describe("На скільки порцій розрахований рецепт"),
  steps: z.array(z.string()).describe("Покрокові інструкції приготування"),
  ingredients: z.array(IngredientSchema),
});
export type Recipe = z.infer<typeof RecipeSchema>;
