import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      thresholds: {
        lines: 90,
        functions: 80,
        branches: 90,
        statements: 90,
      },
      exclude: ["src/types.ts", "**/*.test.ts", "**/*.d.ts"],
    },
  },
});
