// @ts-check
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = tseslint.config(
  {
    ignores: ["dist/", "coverage/", ".angular/", "node_modules/"],
  },
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {type: "attribute", prefix: "app", style: "camelCase"},
      ],
      "@angular-eslint/component-selector": [
        "error",
        {type: "element", prefix: "app", style: "kebab-case"},
      ],
      // `_` is the project's intentional unused-arg placeholder.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_"},
      ],
      // Surface, don't block, on these larger modernisation passes (constructor
      // DI → inject(), and the handful of deliberate `any`s on untyped API JSON).
      "@angular-eslint/prefer-inject": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {},
  },
);
