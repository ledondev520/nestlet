import { useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './assistant-markdown.css';

// Display only: never rewrite the stored, copied, or source-linked message.
// No raw-HTML plugin, embedded resources, or user-controlled component props.
const elements = ['p', 'br', 'strong', 'em', 'del', 'blockquote', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'pre', 'code', 'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'];
const plugins = [remarkGfm];

export function safeMarkdownUrl(value) {
  if (!value || /[\u0000-\u0020\u007f\\]/u.test(value)) return '';
  // Only explicit web/mail destinations. Relative and protocol-relative URLs
  // must not turn untrusted model output into authenticated application actions.
  if (!/^(?:https?:\/\/|mailto:)/iu.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.protocol === 'mailto:') return value;
    return url.hostname && !url.username && !url.password ? value : '';
  } catch { return ''; }
}

const alignmentClass = style => ['left', 'right', 'center'].includes(style?.textAlign) ? `assistant-markdown-align-${style.textAlign}` : undefined;

const components = {
  a: ({ href, children, title }) => href
    ? <a href={href} title={title} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a>
    : <span>{children}</span>,
  // Keep the description but never request an image URL (including trackers).
  img: ({ alt }) => <span className="assistant-markdown-image">{alt || '[image]'}</span>,
  th: ({ children, style }) => <th scope="col" className={alignmentClass(style)}>{children}</th>,
  td: ({ children, style }) => <td className={alignmentClass(style)}>{children}</td>,
};

export function AssistantMarkdown({ content, streaming = false, lang = 'zh' }) {
  // Stable component identities keep a focused/scrolled table in place as tokens arrive.
  const localizedComponents = useMemo(() => ({ ...components,
    table: ({ children }) => <div className="assistant-markdown-table" role="region" aria-label={lang === 'en' ? 'Response table (scroll horizontally)' : '回复表格（可横向滚动）'} tabIndex={0}><table>{children}</table></div>,
    input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} disabled aria-label={lang === 'en' ? (checked ? 'Completed' : 'Not completed') : (checked ? '已完成' : '未完成')} />,
  }), [lang]);
  return <div className="assistant-markdown">
    <Markdown remarkPlugins={plugins} allowedElements={elements} skipHtml urlTransform={safeMarkdownUrl}
      components={localizedComponents}>
      {content}
    </Markdown>
    {streaming && <span className="assistant-markdown-cursor" aria-hidden="true">▍</span>}
  </div>;
}
