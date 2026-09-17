"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserPreferences, useUpdateUserPreferences } from "@/hooks/useUserPreferences";
import { useCurrencies } from "@/hooks/useAccounts";
import { LedgerDiagnosticsSection } from "./_components/LedgerDiagnosticsSection";
import { TransactionRulesSection } from "./_components/TransactionRulesSection";

const SettingsFormSchema = z.object({
  base_currency: z.string().min(1, "Elija una moneda"),
});

type SettingsFormValues = z.infer<typeof SettingsFormSchema>;

export default function SettingsPage() {
  const { data: prefs, isLoading } = useUserPreferences();
  const { data: currencies } = useCurrencies();
  const updatePrefs = useUpdateUserPreferences();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(SettingsFormSchema),
    defaultValues: {
      base_currency: "USD",
    },
  });

  useEffect(() => {
    if (prefs) {
      form.reset({
        base_currency: prefs.base_currency,
      });
    }
  }, [prefs, form]);

  const onSubmit = async (values: SettingsFormValues) => {
    await updatePrefs.mutateAsync({
      base_currency: values.base_currency,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Preferencias de moneda y reportes.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Moneda base</CardTitle>
              <CardDescription>
                Todas las conversiones y totales se muestran en esta moneda.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="base_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={updatePrefs.isPending || prefs?.base_currency_locked}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(currencies ?? [])
                            .filter((c) => c.currency_type === "fiat")
                            .map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.code} ({c.symbol})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    {prefs?.base_currency_locked && (
                      <p className="text-muted-foreground text-xs">
                        No se puede cambiar: tus cuentas y presupuestos ya
                        guardan montos en esta moneda.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Button type="submit" disabled={updatePrefs.isPending}>
            {updatePrefs.isPending ? "Guardando..." : "Guardar preferencias"}
          </Button>
        </form>
      </Form>

      <TransactionRulesSection />

      <LedgerDiagnosticsSection />
    </div>
  );
}
