/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COUNTROLL_API_URL: string;
  readonly VITE_OAUTH_TOKEN_URL: string;
  readonly VITE_OAUTH_CLIENT_ID: string;
  readonly VITE_OAUTH_USERNAME: string;
  readonly VITE_OAUTH_PASSWORD: string;
  readonly VITE_THIRD_PARTY_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
