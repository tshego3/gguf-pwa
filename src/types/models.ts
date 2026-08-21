export type ModelSource = 'catalog' | 'local-file' | 'local-handle';

export interface CatalogModel {
  readonly id: string;
  readonly name: string;
  readonly repo: string;
  readonly files: readonly string[];
  readonly params: string;
  readonly quant: string;
  readonly bytes: number;
  readonly contextLength: number;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly minDeviceMemoryGb: number;
}

export interface InstalledModel {
  readonly modelId: string;
  readonly name: string;
  readonly source: ModelSource;
  readonly bytes: number;
  readonly installedAt: number;
  readonly handleKey?: string;
  readonly fileNames?: readonly string[];
}

export interface DownloadProgress {
  readonly bytesLoaded: number;
  readonly bytesTotal: number;
}

export type GgufValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };
