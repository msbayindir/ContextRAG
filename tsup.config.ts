import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/bin/cli.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    treeshake: true,
    external: ['@prisma/client', 'prisma'],
});
