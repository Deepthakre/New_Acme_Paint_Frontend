import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Underscore-prefixed args/vars are an intentional "unused" escape
      // hatch (e.g. destructuring to omit a field) — keep those quiet, but
      // still flag genuinely unused ones.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The mock dataService intentionally throws/returns `Error` instances
      // built from caught `unknown` — this project prefers explicit
      // `instanceof Error` narrowing (see every catch block) over the `any`
      // shortcut, so this stays on to keep that discipline.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  }
);
