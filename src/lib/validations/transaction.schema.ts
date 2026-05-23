import { z } from "zod/v4";
import { TRANSACTION_TYPES } from "@/types/transactions";

const TransactionAmountLineSchema = z.object({
  account_id: z.string().uuid("Cuenta no válida"),
  amount: z.number().refine((value) => value !== 0, {
    message: "El monto no puede ser 0",
  }),
  exchange_rate: z
    .number()
    .positive("El tipo de cambio debe ser mayor a 0")
    .default(1),
  base_amount: z.number().refine((value) => value !== 0, {
    message: "El monto base no puede ser 0",
  }),
});

export const CreateTransactionSchema = z
  .object({
    // month_id is resolved from `date` in the server action — not needed here
    date: z.string().min(1, "La fecha es obligatoria"),
    transaction_type: z.enum(TRANSACTION_TYPES, {
      error: "Tipo de transacción no válido",
    }),
    category_id: z
      .string()
      .uuid("Categoría no válida")
      .nullable()
      .optional()
      .transform((v) => v || null),
    description: z
      .string()
      .min(1, "La descripción es obligatoria")
      .max(200, "Máximo 200 caracteres")
      .trim(),
    amounts: z
      .array(TransactionAmountLineSchema)
      .min(1, "Debe existir al menos una línea de monto")
      .max(1, "Solo se permite una línea para ingreso/gasto/corrección"),
    notes: z
      .string()
      .max(500, "Las notas no pueden superar 500 caracteres")
      .nullable()
      .optional()
      .or(z.literal(""))
      .transform((v) => v || null),
  })
  .refine(
    (data) => {
      if (data.transaction_type === "transfer") return false;
      return data.category_id != null;
    },
    {
      message: "La categoría es obligatoria",
      path: ["category_id"],
    }
  )
  .refine(
    (data) =>
      data.transaction_type === "income" ||
      data.transaction_type === "expense" ||
      data.transaction_type === "correction",
    {
      message:
        "Usá el formulario de transferencia para transacciones de tipo transferencia",
      path: ["transaction_type"],
    }
  );

export const CreateTransferSchema = z
  .object({
    // month_id is resolved from `date` in the server action — not needed here
    date: z.string().min(1, "La fecha es obligatoria"),
    source_account_id: z.string().uuid("Cuenta origen no válida"),
    destination_account_id: z.string().uuid("Cuenta destino no válida"),
    description: z
      .string()
      .min(1, "La descripción es obligatoria")
      .max(200, "Máximo 200 caracteres")
      .trim(),
    amount: z.number().positive("El monto debe ser mayor a 0"),
    exchange_rate: z
      .number()
      .positive("El tipo de cambio debe ser mayor a 0")
      .default(1),
    base_amount: z.number().positive("El monto base debe ser mayor a 0"),
    fee: z
      .number()
      .min(0, "La comisión no puede ser negativa")
      .optional()
      .default(0),
    notes: z
      .string()
      .max(500, "Las notas no pueden superar 500 caracteres")
      .nullable()
      .optional()
      .or(z.literal(""))
      .transform((v) => v || null),
  })
  .refine(
    (data) => data.source_account_id !== data.destination_account_id,
    {
      message: "La cuenta origen y destino deben ser diferentes",
      path: ["destination_account_id"],
    }
  );

export const UpdateTransactionSchema = z.object({
  id: z.string().uuid("ID de transacción no válido"),
  transaction_type: z.enum(TRANSACTION_TYPES).optional(),
  date: z.string().min(1).optional(),
  category_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v || null),
  description: z.string().min(1).max(200).trim().optional(),
  amounts: z.array(TransactionAmountLineSchema).min(1).optional(),
  source_account_id: z.string().uuid().optional(),
  destination_account_id: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
  exchange_rate: z.number().positive().optional(),
  base_amount: z.number().positive().optional(),
  fee: z.number().min(0).optional(),
  notes: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
}).refine((data) => {
  if (data.source_account_id && data.destination_account_id) {
    return data.source_account_id !== data.destination_account_id;
  }
  return true;
}, {
  message: "La cuenta origen y destino deben ser diferentes",
  path: ["destination_account_id"],
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
export type CreateTransferInput = z.infer<typeof CreateTransferSchema>;
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;
