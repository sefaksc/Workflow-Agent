module.exports = {
  root: true,
  env: {
    es2020: true,
    node: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: [
      "./packages/extension/tsconfig.eslint.json",
      "./packages/webview/tsconfig.eslint.json"
    ]
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking"
  ],
  ignorePatterns: ["dist/", "out/", "**/*.d.ts"],
  overrides: [
    {
      files: ["packages/webview/**/*.{ts,tsx}"],
      plugins: ["react", "react-hooks", "jsx-a11y"],
      extends: [
        "plugin:react/recommended",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended"
      ],
      settings: {
        react: {
          version: "detect"
        }
      },
      rules: {
        "react/react-in-jsx-scope": "off"
      }
    }
  ]
};
