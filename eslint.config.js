import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";

const FEATURES = [
  "ai",
  "app-shell",
  "auth",
  "breakdown",
  "documents",
  "projects",
  "screenplay-editor",
  "versions",
];

// For each feature X: any file under apps/web/app that is NOT inside
// features/X/ is forbidden from importing files inside features/X/ other
// than the barrel (index.ts). Intra-feature imports stay allowed because
// the target glob excludes features/X/ itself.
const featureZones = FEATURES.map((name) => ({
  target: [
    `./apps/web/app/features/!(${name})/**/*`,
    "./apps/web/app/routes/**/*",
    "./apps/web/app/server/**/*",
  ],
  from: `./apps/web/app/features/${name}`,
  except: [`./index.ts`],
  message: `Cross-feature deep import into "${name}". Import from the feature barrel ("~/features/${name}") instead.`,
}));

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.output/**",
      "**/.vinxi/**",
      "**/.tanstack/**",
      "**/build/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "apps/web/app/routeTree.gen.ts",
    ],
  },
  {
    files: ["apps/web/app/**/*.{ts,tsx}"],
    linterOptions: {
      // The actual rule definitions for react-hooks / typescript-eslint
      // are not enforced here — those plugins are loaded only so existing
      // disable directives stay valid. Skip the unused-directive report.
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "import-x": importX,
      // Registered so existing `// eslint-disable-next-line` directives
      // referencing these rules don't error. Rules themselves stay off —
      // this lint pipeline is currently scoped to architectural boundaries.
      "react-hooks": reactHooks,
      "@typescript-eslint": tseslint.plugin,
    },
    settings: {
      "import-x/resolver-next": [
        // Resolve TS path aliases like ~/features/* via tsconfig
        (await import("eslint-import-resolver-typescript")).createTypeScriptImportResolver({
          project: "apps/web/tsconfig.json",
          alwaysTryTypes: true,
        }),
      ],
    },
    rules: {
      "import-x/no-restricted-paths": [
        "error",
        { zones: featureZones },
      ],
    },
  },
);
