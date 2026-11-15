import { defineConfig } from "vitest/config";

// Emulator-backed tests for tools/lms-agent. Run via `npm run test:agent`
// (firebase emulators:exec starts Firestore and sets FIRESTORE_EMULATOR_HOST).
export default defineConfig({
  test: {
    include: ["tests/agent/**/*.test.js"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000, // cold first import of firebase-admin has exceeded 20s on Windows
  },
});
