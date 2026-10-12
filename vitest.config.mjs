import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { maxWorkers: 2, testTimeout: 60000, hookTimeout: 60000, exclude: ['tests/ui/**', 'node_modules/**'] } });
