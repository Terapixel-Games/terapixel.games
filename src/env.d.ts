/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_TPX_AUTH_NAKAMA_BASE_URL?: string;
  readonly PUBLIC_TPX_AUTH_NAKAMA_SERVER_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
