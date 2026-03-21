import { defineConfig } from 'oxlint';

export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
  },
  plugins: [
    'eslint',
    'typescript',
    'unicorn',
    'react',
    'react-perf',
    'oxc',
    'import',
    'promise',
    'vitest',
  ],
  rules: {
    'import/default': 'error',
    'import/export': 'error',
    'import/no-cycle': 'error',
    'promise/prefer-await-to-then': 'error',
    'promise/catch-or-return': 'error',
  },
  overrides: [
    {
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        'typescript/no-misused-promises': 'error',
        'typescript/require-await': 'error',
        'typescript/switch-exhaustiveness-check': 'error',
      },
    },
  ],
});
