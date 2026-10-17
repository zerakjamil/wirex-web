import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {files:['electron/**/*.js','scripts/**/*.js'],rules:{'@typescript-eslint/no-require-imports':'off'}},
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist-electron/**",
    "test-results/**",
    // Reverse-engineering case workspace (evidence files, not app source):
    "work/**",
  ]),
]);

export default eslintConfig;
