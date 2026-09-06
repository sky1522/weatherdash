/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PMTiles 베이스맵 URL. 미설정 시 Protomaps 공개 데모 타일을 쓴다. */
  readonly VITE_PMTILES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
