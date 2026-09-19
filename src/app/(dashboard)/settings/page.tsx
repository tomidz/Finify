"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
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
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { Section } from "@/components/section";
import { StateCard } from "@/components/state-card";
import { useUserPreferences, useUpdateUserPreferences } from "@/hooks/useUserPreferences";
import { useCurrencies } from "@/hooks/useAccounts";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";
import { LedgerDiagnosticsSection } from "./_components/LedgerDiagnosticsSection";
import { TransactionRulesSection } from "./_components/TransactionRulesSection";

const SettingsFormSchema = z.object({
  base_currency: z.string().min(1, "Elija una moneda"),
});

type SettingsFormValues = z.infer<typeof SettingsFormSchema>;

export default function SettingsPage() {
  const { data: prefs, isLoading, error: prefsError, refetch: refetchPrefs } = useUserPreferences();
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
    try {
      await updatePrefs.mutateAsync({
        base_currency: values.base_currency,
      });
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const renderBaseCurrency = () => {
    if (isLoading) return <StateCard variant="loading" className="min-h-24" />;
    // Without the stored preference the form would show, and save, its default.
    if (!prefs) {
      return (
        <StateCard
          variant="error"
          error={prefsError}
          onRetry={() => refetchPrefs()}
          className="min-h-24"
        />
      );
    }
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FormField
            control={form.control}
            name="base_currency"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={updatePrefs.isPending || prefs.base_currency_locked}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Moneda base" className={cn("w-48", uiScale.trigger)}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
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
                  <Button
                    type="submit"
                    size="sm"
                    className={uiScale.button}
                    disabled={updatePrefs.isPending}
                  >
                    {updatePrefs.isPending ? <Spinner className="size-3.5" /> : null}
                    {updatePrefs.isPending ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
                {prefs.base_currency_locked && (
                  <p className="text-muted-foreground text-xs">
                    No se puede cambiar: tus cuentas y presupuestos ya
                    guardan montos en esta moneda.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Configuración</PageHeaderTitle>
          <PageHeaderDescription>Moneda base, reglas y diagnóstico.</PageHeaderDescription>
        </PageHeaderTitleGroup>
      </PageHeader>

      <Section
        title="Moneda base"
        description="Todas las conversiones y totales se muestran en esta moneda."
      >
        {renderBaseCurrency()}
      </Section>

      <TransactionRulesSection />

      <LedgerDiagnosticsSection />
    </div>
  );
}
