// Everything the Worker reads from its Cloudflare environment. Keys are
// secrets (`wrangler secret put`), models and flags are plain vars in
// wrangler.toml. Every field is optional: a provider with no key is
// skipped rather than tried and failed, so a deployment that only holds
// one of the three keys still works.

// The Workers rate-limiting binding. Named to avoid colliding with the
// `RateLimit` interface @cloudflare/workers-types declares globally.
export interface RateLimiterBinding {
  limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>;
}

export interface Env {
  readonly OLLAMA_API_KEY?: string;
  readonly HUGGINGFACE_API_KEY?: string;
  readonly NVIDIA_API_KEY?: string;

  readonly OLLAMA_MODEL?: string;
  readonly HUGGINGFACE_MODEL?: string;
  readonly NVIDIA_MODEL?: string;

  // 'false' turns tool calling off for that provider. Anything else, including
  // absent, leaves it on - the upstream is asked with tools and downgraded
  // automatically if it rejects them.
  readonly OLLAMA_TOOLS?: string;
  readonly HUGGINGFACE_TOOLS?: string;
  readonly NVIDIA_TOOLS?: string;

  // Comma-separated list, or '*'. The PWA is a public static site, so '*' is
  // the documented default; narrowing it is for deployments that want to.
  readonly ALLOWED_ORIGINS?: string;

  // 'true' arms the fetch_url tool. Off by default because a public proxy
  // that fetches arbitrary URLs on request is an abuse surface, not a feature.
  readonly ENABLE_WEB_FETCH?: string;

  readonly MAX_PROMPT_CHARS?: string;

  readonly RATE_LIMITER?: RateLimiterBinding;
}

export function isEnabled(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
