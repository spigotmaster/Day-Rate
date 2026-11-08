import js from '@eslint/js';
import globals from 'globals';
// Lints the new, clean modules and tests. The app modules split out of index.html (src/state.js etc.) keep their
// original compact style for now and are brought under lint one file at a time.
export default [
  { ignores: ['node_modules', 'dist', 'insights.js', 'achievements.js', 'sw.js', 'tests/achievements.test.js'] },
  js.configs.recommended,
  {
    files: ['src/storage.js', 'src/migrate.js', 'src/errorlog.js', 'src/review.js', 'src/demo.js', 'tests/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], eqeqeq: ['error', 'always', { null: 'ignore' }] },
  },
];
