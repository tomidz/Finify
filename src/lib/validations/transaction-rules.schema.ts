import { z } from "zod/v4";
import { MATCH_FIELDS, MATCH_TYPES } from "@/types/transaction-rules";

// trim() BEFORE min(): checks run in declaration order, so min-then-trim let
// a single space pass validation and become "", turning the rule into a
// match-everything rule (`"".includes("")` is always true).
const RuleFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(100, "Máximo 100 caracteres"),
  match_field: z.enum(MATCH_FIELDS, {
    message: "Elegí un campo para buscar",
  }),
  match_type: z.enum(MATCH_TYPES, {
    message: "Elegí un tipo de coincidencia",
  }),
  match_value: z
    .string()
    .trim()
    .min(1, "El valor de búsqueda es obligatorio")
    .max(200),
  action_category_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v || null),
  action_account_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v || null),
  action_rename: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v || null),
  priority: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

export const CreateTransactionRuleSchema = RuleFieldsSchema.refine(
  (data) =>
    data.action_category_id != null ||
    data.action_account_id != null ||
    (data.action_rename != null && data.action_rename.trim() !== ""),
  {
    message: "La regla necesita al menos una acción (categoría, cuenta o renombrar)",
    path: ["action_category_id"],
  },
);

export const UpdateTransactionRuleSchema = RuleFieldsSchema.partial().extend({
  id: z.string().uuid(),
});

export type CreateTransactionRuleInput = z.infer<
  typeof CreateTransactionRuleSchema
>;
export type UpdateTransactionRuleInput = z.infer<
  typeof UpdateTransactionRuleSchema
>;
