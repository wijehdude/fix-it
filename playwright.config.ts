import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end smoke test. Runs the production build with MOCK_AI=1 so no OpenAI key or network is needed.
 * Run `npm run build` first (or set E2E_BASE_URL to test a deployed URL).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        port: PORT,
        reuseExistingServer: false,
        timeout: 120_000,
        env: { MOCK_AI: "1", RATE_LIMIT_PER_MIN: "1000" },
      },
});
