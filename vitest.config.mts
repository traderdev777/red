import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "supabase/tests/**/*.test.ts", "apps/scanner/test/**/*.test.ts"],
    testTimeout: 15_000,
    pool: "forks",
  },
});
