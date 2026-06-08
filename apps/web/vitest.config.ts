import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // The gold set is opt-in (network + Gemini); run it via `npm run test:gold`, never here.
    exclude: [...configDefaults.exclude, "gold/**"],
  },
});
