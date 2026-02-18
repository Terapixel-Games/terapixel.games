/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_TPX_IDENTITY_LOGIN_URL?: string;
  readonly PUBLIC_TPX_IDENTITY_LOGOUT_URL?: string;
  readonly PUBLIC_TPX_IDENTITY_SESSION_URL?: string;
  readonly PUBLIC_TPX_IDENTITY_RETURN_PARAM?: string;
  readonly PUBLIC_TPX_IDENTITY_EMAIL_PARAM?: string;
  readonly PUBLIC_TPX_IDENTITY_LOGOUT_METHOD?: string;
  readonly PUBLIC_TPX_IDENTITY_HYDRATE_SESSION_ON_LOAD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
