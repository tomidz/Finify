"use client";

import { RouteError, type RouteErrorProps } from "@/components/route-error";

export default function TransactionsError(props: RouteErrorProps) {
  return <RouteError title="Error al cargar transacciones" {...props} />;
}
