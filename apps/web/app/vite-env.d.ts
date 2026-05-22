/// <reference types="vite/client" />

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

interface ImportMetaEnv {
  /** True when the build was started with MOCK_AI=true (E2E test mode). */
  readonly MOCK_AI: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
