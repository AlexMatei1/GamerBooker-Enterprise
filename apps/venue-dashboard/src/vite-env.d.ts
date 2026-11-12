/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Published Google Form used by cafes to request an account. */
  readonly VITE_CAFE_APPLICATION_FORM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
