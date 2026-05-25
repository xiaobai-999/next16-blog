import nextPlugin from "@next/eslint-plugin-next";
import baseConfig from "./base.js";

export default [
  ...baseConfig,
  {
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules
    }
  }
];
