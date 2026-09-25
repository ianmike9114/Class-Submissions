import { defineConfig } from "vitest/config";

// Emulator-backed firestore.rules integration suite. Run via `npm run test:rules`
// (firebase emulators:exec starts the Firestore emulator around this run).
// Serial + single fork: all tests share one emulator instance and rely on
// clearFirestore() between them, so they must not run in parallel.
export default defineConfig({
  test: {
    include: ["tests/rules/**/*.test.js"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
