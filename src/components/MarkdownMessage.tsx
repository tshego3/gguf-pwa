import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, type ReactNode } from 'react';

interface MarkdownMessageProps {
  readonly content: string;
}

// Model output is untrusted input. marked renders markdown to HTML, then
// dompurify sanitises it before it ever reaches the DOM - this is not
// optional (P4-T5, and the security rules in gguf-pwa-inference-storage).
export function MarkdownMessage({ content }: MarkdownMessageProps): ReactNode {
  const html = useMemo(() => {
    const rawHtml = marked.parse(content, { async: false, breaks: true });
    return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
  }, [content]);

  return <div className="md-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
