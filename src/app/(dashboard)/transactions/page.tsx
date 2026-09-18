import { Suspense } from "react";
import { TransactionsPageSkeleton } from "./_components/TransactionsPageSkeleton";
import { TransactionsTable } from "./_components/TransactionsTable";

export default function TransactionsPage() {
  // The header lives in TransactionsTable: its actions open the table's dialogs.
  return (
    <Suspense fallback={<TransactionsPageSkeleton />}>
      <TransactionsTable />
    </Suspense>
  );
}
