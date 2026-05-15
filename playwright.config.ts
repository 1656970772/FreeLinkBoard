import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  outputDir: "test-results/e2e",
  reporter: [["list"]],
  testDir: "tests/e2e",
  timeout: 30000,
  use: {
    trace: "retain-on-failure"
  },
  workers: 1
});
