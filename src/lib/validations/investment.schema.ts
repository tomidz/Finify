import { z } from "zod";
import { today } from "@/lib/dates";
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
  // Purchase fees/taxes: capitalized into the lot's cost basis and included
  // in the cash deduction.
  fees: z.number().min(0, "Las comisiones no pueden ser negativas").optional().default(0),
  tax: z.number().min(0, "Los impuestos no pueden ser negativos").optional().default(0),
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

export const AdjustInvestmentPositionSchema = z.object({
  account_id: z.string().uuid("Cuenta inválida"),
  asset_name: z.string().min(1, "El activo es obligatorio").max(200),
  ticker: z.string().max(20).nullable().optional(),
  isin: z.string().max(20).nullable().optional(),
  asset_type: z.enum(ASSET_TYPES),
  currency: z.string().min(1, "La moneda es obligatoria"),
  direction: z.enum(["increase", "decrease"]),
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
  // Optional cost basis for increases (0 = pure adjustment, e.g. interés o airdrop).
  cost_basis: z
    .number()
    .min(0, "El costo no puede ser negativo")
    .optional()
    .default(0),
  adjustment_date: z.string().min(1, "La fecha es obligatoria"),
  notes: z.string().max(500).nullable().optional(),
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

export const ManualPriceSchema = z
  .object({
    // The distinct lookups of the holding's lots: a lot's name, ticker and
    // ISIN decide its lookup.
    lots: z
      .array(
        z.object({
          asset_name: z.string().min(1, "El activo es obligatorio").max(200),
          ticker: z.string().max(20).nullable().optional(),
          isin: z.string().max(20).nullable().optional(),
        }),
      )
      .min(1)
      .max(500),
    asset_type: z.enum(ASSET_TYPES),
    currency: z.string().min(1, "La moneda es obligatoria"),
    price: z.number().positive("El precio debe ser mayor a 0"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
      .refine((date) => date <= today(), "La fecha no puede ser futura"),
  })
  .refine((data) => data.asset_type !== "cash" && data.asset_type !== "stablecoin", {
    message: "El efectivo y las stablecoins no llevan precio manual",
    path: ["asset_type"],
  });

const SwapAssetSchema = z.object({
  asset_name: z.string().min(1, "El activo es obligatorio").max(200),
  ticker: z.string().max(20).nullable().optional(),
  isin: z.string().max(20).nullable().optional(),
  asset_type: z.enum(ASSET_TYPES),
  currency: z.string().min(1, "La moneda es obligatoria"),
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
});

export const SwapInvestmentSchema = z
  .object({
    account_id: z.string().uuid("Cuenta inválida"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
    // Market value of the swap, in the currency of both assets.
    value: z.number().positive("El valor debe ser mayor a 0"),
    given: SwapAssetSchema,
    received: SwapAssetSchema,
    fee_quantity: z.number().min(0, "La comisión no puede ser negativa").optional().default(0),
    fee_asset: z.enum(["given", "received"]).optional().default("given"),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((data) => data.given.currency === data.received.currency, {
    message: "Los dos activos tienen que estar en la misma moneda",
    path: ["received", "currency"],
  });

export type CreateInvestmentInput = z.infer<typeof CreateInvestmentSchema>;
export type SwapInvestmentInput = z.input<typeof SwapInvestmentSchema>;
export type ManualPriceInput = z.input<typeof ManualPriceSchema>;
export type UpdateInvestmentInput = z.infer<typeof UpdateInvestmentSchema>;
export type TransferInvestmentPositionInput = z.infer<
  typeof TransferInvestmentPositionSchema
>;
export type SellInvestmentInput = z.infer<typeof SellInvestmentSchema>;
export type AdjustInvestmentPositionInput = z.infer<
  typeof AdjustInvestmentPositionSchema
>;
