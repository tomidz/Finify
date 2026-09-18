"use client";

import { RouteError, type RouteErrorProps } from "@/components/route-error";

export default function DashboardError(props: RouteErrorProps) {
  return <RouteError title="No se pudo cargar esta vista" {...props} />;
}
