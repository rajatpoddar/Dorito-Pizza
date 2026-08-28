/* ESLint config for the Dorito React SPA.
 * Kept minimal on purpose: catches the bugs that actually bite
 * (missing deps in useEffect, undefined refs, unused imports) without
 * bikeshedding style. Style decisions live in .prettierrc.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: "18.3" } },
  rules: {
    "react/prop-types": "off", // we don't ship prop-types; we use TS-light JSDoc
    "react/react-in-jsx-scope": "off", // new JSX transform
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    // RULES.md §6: never log to the console. Use a real logger or surface
    // errors through the UI. eslint will treat any console.* as an error.
    "no-console": "error",
  },
  ignorePatterns: ["dist/", "node_modules/", "scripts/"],
};
