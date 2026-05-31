import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      FORCE_COLOR: "1",
    },
    include: ["src/**/*.test.ts"],
  },
});
