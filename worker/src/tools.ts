// Tools the proxy offers to models that support tool calling. The registry
// is small on purpose: every tool here runs on the Worker's own bill and is
// reachable by anyone who can reach the Worker, so each one has to justify
// that exposure.
//
// Whether tools are offered at all is decided per provider (see
// providers.ts) and downgraded automatically when an upstream rejects a
// tools array, so a model without tool support still answers normally.
import { isEnabled, type Env } from './env';

export interface ToolSpec {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface Tool {
  readonly spec: ToolSpec;
  run(args: Record<string, unknown>): Promise<string>;
}

const FETCH_TIMEOUT_MS = 10_000;
const FETCH_MAX_CHARS = 8_000;

// RFC 1918, loopback, link-local (including the 169.254.169.254 metadata
// address every cloud exposes), and the reserved TLDs a private resolver
// answers for. Cloudflare's fetch will not reach most of these from the
// edge anyway; this refuses before the request rather than relying on that.
const BLOCKED_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /\.(local|internal|home|lan|localdomain)$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
];

export function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function toPlainText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function currentTime(args: Record<string, unknown>): string {
  const timeZone = typeof args.timezone === 'string' && args.timezone ? args.timezone : 'UTC';
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(new Date());
    return `${formatted} (${timeZone})`;
  } catch {
    return `Unknown time zone "${timeZone}". Use an IANA name such as Africa/Johannesburg.`;
  }
}

async function fetchUrl(args: Record<string, unknown>): Promise<string> {
  const raw = typeof args.url === 'string' ? args.url : '';
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'That is not a valid URL.';
  }
  if (parsed.protocol !== 'https:') return 'Only https URLs can be fetched.';
  if (isBlockedHost(parsed.hostname)) return 'That host is not reachable from this proxy.';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'text/html, text/plain, application/json' },
    });
    if (!response.ok) return `The page answered ${response.status}.`;
    const body = await response.text();
    const text = toPlainText(body);
    return text ? text.slice(0, FETCH_MAX_CHARS) : 'The page had no readable text.';
  } catch {
    return 'The page could not be fetched.';
  } finally {
    clearTimeout(timer);
  }
}

const TIME_TOOL: Tool = {
  spec: {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time. Use this whenever the answer depends on today.',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'IANA time zone name, for example Europe/London. Defaults to UTC.' },
        },
        required: [],
      },
    },
  },
  run: (args) => Promise.resolve(currentTime(args)),
};

const FETCH_TOOL: Tool = {
  spec: {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a public https web page and return its readable text, truncated.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The absolute https URL to fetch.' },
        },
        required: ['url'],
      },
    },
  },
  run: fetchUrl,
};

export function buildToolRegistry(env: Env): ReadonlyMap<string, Tool> {
  const tools = new Map<string, Tool>([[TIME_TOOL.spec.function.name, TIME_TOOL]]);
  if (isEnabled(env.ENABLE_WEB_FETCH, false)) {
    tools.set(FETCH_TOOL.spec.function.name, FETCH_TOOL);
  }
  return tools;
}

export function toolSpecs(registry: ReadonlyMap<string, Tool>): readonly ToolSpec[] {
  return [...registry.values()].map((tool) => tool.spec);
}

// Runs one call the model asked for. Unknown names and unparseable
// arguments come back as tool output rather than an exception, because the
// model can recover from a message and cannot recover from a dropped turn.
export async function runToolCall(
  registry: ReadonlyMap<string, Tool>,
  name: string,
  rawArgs: string,
): Promise<string> {
  const tool = registry.get(name);
  if (!tool) return `No tool named ${name} is available.`;

  let args: Record<string, unknown> = {};
  if (rawArgs.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawArgs);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      return 'The tool arguments were not valid JSON. Call the tool again with valid JSON.';
    }
  }
  return tool.run(args);
}
