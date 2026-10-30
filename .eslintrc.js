/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  ignorePatterns: ['dist', 'coverage', 'node_modules', 'prisma', '.eslintrc.js'],
  rules: {
    eqeqeq: ['error', 'smart'],
    'prefer-const': 'error',
    // Structured logging only: an ad-hoc console line escapes the trace_id/redaction contract.
    'no-console': 'error',
    // Money is integer minor units (bani). Floats must never enter a monetary path.
    'no-restricted-globals': [
      'error',
      {
        name: 'parseFloat',
        message:
          'Money is integer minor units (bani). Parse the minor-unit string as an integer instead.',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
};
