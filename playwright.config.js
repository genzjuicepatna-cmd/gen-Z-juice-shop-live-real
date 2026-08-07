import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Two specs are opt-in. Visual capture asserts nothing and writes a few
  // hundred PNGs; the operator a11y sweep needs the app built against the stub
  // Supabase origin, which the default suite is not. Their npm scripts set the
  // matching flag.
  testIgnore: [
    ...(process.env.VISUAL_CAPTURE ? [] : ['**/visual-baseline.spec.ts']),
    ...(process.env.ADMIN_A11Y ? [] : ['**/admin-accessibility.spec.ts']),
  ],
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // The app performs IndexedDB and browser-engine initialization on every fresh
  // context. One worker keeps the release matrix deterministic on constrained
  // CI and avoids OS-level browser teardown failures after otherwise green runs.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Sandboxed CI images often ship one pinned Chromium that does not match
    // the build this Playwright release expects. Point at it explicitly rather
    // than re-downloading a browser into an image that cannot keep it.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
      : {})
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
    { name: 'iPhone SE', use: { ...devices['iPhone SE'], browserName: 'chromium' } },
    { name: 'iPhone 15', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
    { name: 'Pixel 5', use: { ...devices['Pixel 5'], browserName: 'chromium' } },
    { name: 'iPad', use: { ...devices['iPad Pro 11'], browserName: 'chromium' } }
  ]
});
