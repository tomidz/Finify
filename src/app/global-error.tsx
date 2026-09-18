"use client";

import "./globals.css";
import { RouteError, type RouteErrorProps } from "@/components/route-error";

// Replaces the root layout when it fails, so it brings its own <html>, <body>
// and styles.
export default function GlobalError(props: RouteErrorProps) {
  return (
    <html lang="es">
      <body className="min-h-svh bg-background p-4 text-foreground antialiased">
        <RouteError title="No se pudo cargar Finify" className="mx-auto mt-12 max-w-md" {...props} />
      </body>
    </html>
  );
}
