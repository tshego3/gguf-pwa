export interface HfGgufFile {
  readonly name: string;
  readonly bytes: number;
}

export interface HfModelDetail {
  readonly id: string;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly ggufFiles: readonly HfGgufFile[];
}
