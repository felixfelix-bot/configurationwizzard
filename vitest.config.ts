import { defineConfig } from 'vitest/config';

// Minimal vitest config for the cashu-validate unit tests.
// The repo's existing toolchain is Vite ^8; keeping vitest in the same
// family avoids introducing a second dependency graph. Tests live next to
// their module under src/lib/.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
