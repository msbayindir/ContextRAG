import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['./tests/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'dist/', 'tests/', 'examples/'],
            thresholds: {
                // Current: 18% - Target: gradually increase as engine/service tests are added
                lines: 15,
                functions: 55,
                branches: 70,
                statements: 15,
            },
        },
        testTimeout: 30000,
    },
});
