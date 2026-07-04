import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "dist",
      "node_modules",
      "pnpm-lock.yaml",
      "*.tsbuildinfo",
      "**/routeTree.gen.ts",
    ],
    sortPackageJson: {},
  },
  lint: {
    ignorePatterns: [
      "dist",
      "node_modules",
      "pnpm-lock.yaml",
      "*.tsbuildinfo",
      "**/routeTree.gen.ts",
    ],
    plugins: ["eslint", "oxc", "react", "unicorn", "typescript"],
    categories: {
      correctness: "deny",
      suspicious: "deny",
      perf: "warn",
    },
    rules: {
      "react-in-jsx-scope": "off",
      "react-hooks/exhaustive-deps": "warn",
      "eslint/no-shadow": "off",
      "eslint/no-await-in-loop": "off",
      "typescript/no-floating-promises": "deny",
      "typescript/no-implied-eval": "deny",
      "typescript/no-unsafe-type-assertion": "deny",
      "typescript/await-thenable": "deny",
      "typescript/require-array-sort-compare": "deny",
      "typescript/restrict-template-expressions": "deny",
      "typescript/unbound-method": "deny",
    },
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
});
