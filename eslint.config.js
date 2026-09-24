// @ts-check
import { defineConfig } from 'eslint/config';

import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default defineConfig({
  ignores: ['**/node_modules/**', '**/dist/**'],
  files: ['**/*.{js,ts}'],
  extends: [js.configs.recommended, tseslint.configs.recommended, prettierConfig],
  plugins: {
    'unused-imports': unusedImports,
  },
  rules: {
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
});
