"use client";

import { RouteError, type RouteErrorProps } from "@/components/route-error";

export default function NetWorthError(props: RouteErrorProps) {
  return <RouteError title="Error al cargar patrimonio neto" {...props} />;
}
