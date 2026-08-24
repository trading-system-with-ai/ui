/// <reference types="vitest" />
// §47 component tests (upgrade 2026-08-12): dialog behavior — focus trap,
// cancel/confirm, ESC, destructive state, loading state, disabled submit,
// keyboard navigation. Kept separate from Next's build; run with
// `npm run test:components`.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    environment: "jsdom",
    include: ["components/**/*.test.tsx", "lib/**/*.test.ts"],
    globals: true,
  },
});
