import { RecurringTable } from "./_components/RecurringTable";
import { PendingRecurringCard } from "./_components/PendingRecurringCard";

export default function RecurringPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Transacciones Recurrentes
        </h1>
        <p className="text-muted-foreground text-sm">
          Definí gastos e ingresos que se repiten. Cada mes te sugerimos los
          pendientes y los registrás con un clic.
        </p>
      </div>
      <PendingRecurringCard />
      <RecurringTable />
    </div>
  );
}
