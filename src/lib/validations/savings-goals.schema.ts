import { z } from "zod/v4";

export const CreateSavingsGoalSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(120, "Máximo 120 caracteres")
    .trim(),
  target_amount: z.number().positive("El monto objetivo debe ser mayor a 0"),
  current_amount: z.number().min(0).optional().default(0),
  currency: z.string().min(1, "La moneda es obligatoria"),
  deadline: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  account_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v || null),
  color: z.string().max(20).optional().default("#60a5fa"),
});

export const UpdateSavingsGoalSchema = CreateSavingsGoalSchema.partial().extend(
  {
    id: z.string().uuid(),
    current_amount: z.number().min(0).optional(),
    is_completed: z.boolean().optional(),
  }
);

export type CreateSavingsGoalInput = z.infer<typeof CreateSavingsGoalSchema>;
export type UpdateSavingsGoalInput = z.infer<typeof UpdateSavingsGoalSchema>;
