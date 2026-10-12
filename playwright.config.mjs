import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: 'tests/ui', workers: 1, timeout: 30000, reporter: 'list', use: { ...(process.env.CI ? {} : { channel: 'chrome' }), headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' } });
