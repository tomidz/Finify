"use client";

import { RouteError, type RouteErrorProps } from "@/components/route-error";

export default function BudgetError(props: RouteErrorProps) {
  return <RouteError title="Error al cargar presupuesto" {...props} />;
}
