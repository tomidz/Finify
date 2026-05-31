import { z } from "zod";
import { ASSET_TYPES } from "@/types/investments";

export const CreateInvestmentSchema = z.object({
  account_id: z.string().uuid("Cuenta inválida"),
  asset_name: z.string().min(1, "El nombre es obligatorio").max(200),
  ticker: z.string().max(20).nullable().optional(),
  isin: z.string().max(20).nullable().optional(),
  asset_type: z.enum(ASSET_TYPES),
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
  price_per_unit: z.number().positive("El precio debe ser mayor a 0"),
  total_cost: z.number().positive("El costo total debe ser mayor a 0"),
  currency: z.string().min(1, "La moneda es obligatoria"),
  purchase_date: z.string().min(1, "La fecha es obligatoria"),
  notes: z.string().max(500).nullable().optional(),
  skip_deduction: z.boolean().optional().default(false),
});

export const UpdateInvestmentSchema = CreateInvestmentSchema.partial().extend({
  id: z.string().uuid(),
});

export const TransferInvestmentPositionSchema = z.object({
  source_account_id: z.string().uuid("Cuenta origen invalida"),
  destination_account_id: z.string().uuid("Cuenta destino invalida"),
  asset_name: z.string().min(1, "El activo es obligatorio").max(200),
  ticker: z.string().max(20).nullable().optional(),
  isin: z.string().max(20).nullable().optional(),
  asset_type: z.enum(ASSET_TYPES),
  currency: z.string().min(1, "La moneda es obligatoria"),
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
  // Network/withdrawal fee charged in units of the asset: the destination
  // receives quantity - fee_quantity (cost is preserved on what arrives).
  fee_quantity: z
    .number()
    .min(0, "La comisión no puede ser negativa")
    .optional()
    .default(0),
  // Cash fee charged to the source account (in its own currency).
  fee_cash: z
    .number()
    .min(0, "La comisión no puede ser negativa")
    .optional()
    .default(0),
  transfer_date: z.string().min(1, "La fecha es obligatoria"),
  notes: z.string().max(500).nullable().optional(),
})
  .refine((data) => data.source_account_id !== data.destination_account_id, {
    message: "La cuenta origen y destino deben ser diferentes",
    path: ["destination_account_id"],
  })
  .refine((data) => data.fee_quantity < data.quantity, {
    message: "La comisión debe ser menor a la cantidad transferida",
    path: ["fee_quantity"],
  });

export const SellInvestmentSchema = z.object({
  account_id: z.string().uuid("Cuenta inválida"),
  asset_name: z.string().min(1, "El activo es obligatorio").max(200),
  ticker: z.string().max(20).nullable().optional(),
  isin: z.string().max(20).nullable().optional(),
  asset_type: z.enum(ASSET_TYPES),
  currency: z.string().min(1, "La moneda es obligatoria"),
  quantity_sold: z.number().positive("La cantidad debe ser mayor a 0"),
  price_per_unit: z.number().positive("El precio debe ser mayor a 0"),
  fees: z.number().min(0, "Las comisiones no pueden ser negativas").optional().default(0),
  tax: z.number().min(0, "Los impuestos no pueden ser negativos").optional().default(0),
  sale_date: z.string().min(1, "La fecha es obligatoria"),
  notes: z.string().max(500).nullable().optional(),
  skip_credit: z.boolean().optional().default(false),
});

export type CreateInvestmentInput = z.infer<typeof CreateInvestmentSchema>;
export type UpdateInvestmentInput = z.infer<typeof UpdateInvestmentSchema>;
export type TransferInvestmentPositionInput = z.infer<
  typeof TransferInvestmentPositionSchema
>;
export type SellInvestmentInput = z.infer<typeof SellInvestmentSchema>;
