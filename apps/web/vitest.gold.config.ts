import { defineConfig } from "vitest/config";
import path from "path";

// Opt-in gold-set config (run via `npm run test:gold`). Only the gold/ suite; needs a running
// app at GOLD_BASE_URL (default http://localhost:3000) and makes real Gemini calls.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["gold/**/*.test.ts"],
    // Real LLM round-trips per case, plus up to 2 retries on transient upstream (Gemini 503).
    testTimeout: 180_000,
    hookTimeout: 30_000,
  },
});
