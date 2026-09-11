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

export const AddedProductSchema = z.object({
  ingredient: z.string().describe("Інгредієнт з рецепта, для якого підібрано товар"),
  product: z.string().describe("Назва товару в Сільпо"),
  quantity: z.number().describe("Кількість, додана в кошик (штуки або кг)"),
  price: z.number().optional().describe("Ціна за одиницю, грн"),
  isPromo: z.boolean().describe("Чи товар зараз за акцією"),
});

export const CartResultSchema = z.object({
  status: z
    .enum(["done", "address_required", "auth_error", "failed"])
    .describe(
      "done — товари додано; address_required — кошика нема і нема збереженої адреси, " +
        "потрібна адреса доставки від користувача; auth_error — MCP відповідає 401/403; " +
        "failed — інша помилка",
    ),
  added: z.array(AddedProductSchema).describe("Що саме додано в кошик"),
  notFound: z.array(z.string()).describe("Інгредієнти, для яких не знайдено підходящого товару"),
  totalPrice: z.number().optional().describe("Сума кошика після додавання, грн"),
  checkoutWebLink: z.string().optional().describe("checkoutWebLink з кошика, якщо є"),
  checkoutMobileLink: z.string().optional().describe("checkoutMobileLink з кошика, якщо є"),
  message: z.string().describe("Коротке пояснення для користувача українською (1-3 речення)"),
});
export type CartResult = z.infer<typeof CartResultSchema>;
