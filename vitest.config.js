import { defineConfig } from "vitest/config";

// Default `npm test`: fast, offline unit tests only. The emulator-backed rules
// suite lives under tests/rules/ and runs via `npm run test:rules` with its own
// config (vitest.rules.config.js), so a plain unit run never needs the emulator.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.js"],
  },
});
