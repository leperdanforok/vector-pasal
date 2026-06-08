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
    // Real LLM round-trips per case — give each test room.
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
