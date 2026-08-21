import type { CatalogModel, HfGgufFile, HfModelDetail } from '../types';

// Hugging Face's model-hub API reflects the request's Origin back as
// Access-Control-Allow-Origin (verified with curl against real Origin
// headers, including a github.io-style one) rather than sending a literal
// '*', but the effect for an unauthenticated GET is the same: no proxy is
// needed, matching the plan's "no Cloudflare proxy" decision for the
// resolve/ download endpoints. This is the same host already allowed in
// the CSP's connect-src.
const HF_API_BASE = 'https://huggingface.co/api/models';

// Restricted to this one repository by explicit instruction, rather than
// the full Hugging Face hub - ggml-org's own curated GGUF collection, used
// elsewhere in this project as the CI fixture source (e2e/fixtures). Note:
// the repo itself redirects server-side to ggml-org/models-moved; fetch()
// follows that redirect transparently, so this constant intentionally
// stays the name actually given rather than the redirect target.
export const BROWSABLE_REPO = 'ggml-org/models';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const GGUF_SUFFIX = /\.gguf$/i;

export function parseModelDetail(repoId: string, json: unknown): HfModelDetail {
  if (!isRecord(json)) {
    throw { type: 'download', message: 'Hugging Face returned an unexpected response for this model.' };
  }

  const siblings = Array.isArray(json.siblings) ? json.siblings : [];
  const ggufFiles: HfGgufFile[] = siblings
    .filter(isRecord)
    .filter((s) => typeof s.rfilename === 'string' && GGUF_SUFFIX.test(s.rfilename))
    .map((s) => ({ name: s.rfilename as string, bytes: typeof s.size === 'number' ? s.size : 0 }));

  const cardData = isRecord(json.cardData) ? json.cardData : {};
  const licence = typeof cardData.license === 'string' ? cardData.license : 'Unknown - verify on the model page';
  const licenceUrl =
    typeof cardData.license_link === 'string' ? cardData.license_link : `https://huggingface.co/${repoId}`;

  return { id: repoId, licence, licenceUrl, ggufFiles };
}

export async function getHuggingFaceModelDetail(repoId: string, signal?: AbortSignal): Promise<HfModelDetail> {
  // blobs=true is what makes the API return each file's real byte size -
  // without it, sizes must come from a HEAD request per file, and this
  // repo alone carries over twenty.
  const url = `${HF_API_BASE}/${repoId}?blobs=true`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw { type: 'download', message: 'Could not load this model’s file list from Hugging Face.', status: response.status };
  }
  const json: unknown = await response.json();
  return parseModelDetail(repoId, json);
}

const QUANT_PATTERN = /(IQ\d_[A-Z]+|Q\d_K[_A-Z]*|Q\d_\d|F16|F32|BF16)/i;

function guessQuant(filename: string): string {
  return QUANT_PATTERN.exec(filename)?.[0]?.toUpperCase() ?? 'unknown quant';
}

function estimateMinDeviceMemoryGb(bytes: number): number {
  const gb = bytes / 1024 ** 3;
  if (gb <= 0.4) return 3;
  if (gb <= 0.9) return 4;
  return 6;
}

// Builds a CatalogModel from a chosen Hugging Face file so it can flow
// through the exact same consent/pre-flight/download pipeline the curated
// catalog uses (P2-T7 through P2-T9) - nothing downstream needs to know
// this model did not come from public/models.json.
export function toCatalogModel(detail: HfModelDetail, file: HfGgufFile): CatalogModel {
  return {
    id: `hf:${detail.id}/${file.name}`,
    name: file.name.replace(/\.gguf$/i, ''),
    repo: detail.id,
    files: [file.name],
    params: '',
    quant: guessQuant(file.name),
    bytes: file.bytes,
    contextLength: 0,
    licence: detail.licence,
    licenceUrl: detail.licenceUrl,
    minDeviceMemoryGb: estimateMinDeviceMemoryGb(file.bytes),
  };
}
