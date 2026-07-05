import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    // Glob patterns, not bare names: "node_modules" alone fails to prune
    // nested real directories and once ran 13k third-party tests locally.
    exclude: ["**/node_modules/**", "**/.next/**", "**/out/**", "**/build/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only throws when imported outside of a Server Component build.
      // In tests we exercise the modules directly, so alias it to a no-op.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
