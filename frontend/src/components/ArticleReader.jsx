import { useState, useEffect } from 'react'
import { api } from '../api'
import { topicMeta } from './TopicFilter'
import { timeAgo } from './BlogCard'

// Very simple markdown renderer — handles headings, bold, italic, code, links, bullets
function SimpleMarkdown({ text }) {
  if (!text) return null

  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank line
    if (!line.trim()) { i++; continue }

    // Heading
    const h3 = line.match(/^### (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h1 = line.match(/^# (.+)/)
    if (h1) { elements.push(<h1 key={i} className="text-xl font-bold text-white mt-6 mb-2">{inlineFormat(h1[1])}</h1>); i++; continue }
    if (h2) { elements.push(<h2 key={i} className="text-lg font-semibold text-white mt-5 mb-2">{inlineFormat(h2[1])}</h2>); i++; continue }
    if (h3) { elements.push(<h3 key={i} className="text-base font-semibold text-slate-200 mt-4 mb-1.5">{inlineFormat(h3[1])}</h3>); i++; continue }

    // Bullet list
    if (line.match(/^[-*] /)) {
      const items = []
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(<li key={i} className="text-sm text-slate-300 leading-relaxed">{inlineFormat(lines[i].replace(/^[-*] /, ''))}</li>)
        i++
      }
      elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-3 pl-2">{items}</ul>)
      continue
    }

    // Numbered list
    if (line.match(/^\d+\. /)) {
      const items = []
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(<li key={i} className="text-sm text-slate-300 leading-relaxed">{inlineFormat(lines[i].replace(/^\d+\. /, ''))}</li>)
        i++
      }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-3 pl-2">{items}</ol>)
      continue
    }

    // Code block
    if (line.startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <pre key={`code-${i}`} className="bg-black/40 border border-border rounded-lg p-4 my-4 overflow-x-auto">
          <code className="text-xs text-green-300 font-mono">{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const qLines = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        qLines.push(lines[i].replace(/^> /, ''))
        i++
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-2 border-blue-500/50 pl-4 my-3 italic text-sm text-muted">
          {qLines.map((l, j) => <p key={j}>{inlineFormat(l)}</p>)}
        </blockquote>
      )
      continue
    }

    // Paragraph
    elements.push(<p key={i} className="text-sm text-slate-300 leading-relaxed my-2">{inlineFormat(line)}</p>)
    i++
  }

  return <div className="prose-custom">{elements}</div>
}

function inlineFormat(text) {
  // Process inline markdown: code, bold, italic, links
  const parts = []
  let remaining = text
  let key = 0

  const patterns = [
    { re: /`([^`]+)`/,               render: (m) => <code key={key++} className="bg-black/40 text-green-300 font-mono text-xs px-1.5 py-0.5 rounded">{m[1]}</code> },
    { re: /\*\*([^*]+)\*\*/,         render: (m) => <strong key={key++} className="text-white font-semibold">{m[1]}</strong> },
    { re: /\*([^*]+)\*/,             render: (m) => <em key={key++} className="italic text-slate-200">{m[1]}</em> },
    { re: /\[([^\]]+)\]\(([^)]+)\)/, render: (m) => <a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{m[1]}</a> },
  ]

  while (remaining) {
    let earliest = null
    let earliestIndex = Infinity
    let earliestPattern = null

    for (const p of patterns) {
      const match = remaining.match(p.re)
      if (match && match.index < earliestIndex) {
        earliest = match
        earliestIndex = match.index
        earliestPattern = p
      }
    }

    if (!earliest) {
      parts.push(remaining)
      break
    }

    if (earliestIndex > 0) parts.push(remaining.slice(0, earliestIndex))
    parts.push(earliestPattern.render(earliest))
    remaining = remaining.slice(earliestIndex + earliest[0].length)
  }

  return parts
}

export default function ArticleReader({ article, onClose, onBookmark }) {
  const [content, setContent]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [bookmarked, setBookmarked] = useState(!!article.is_bookmarked)

  const meta = topicMeta(article.topic)

  useEffect(() => {
    setLoading(true)
    api.getArticleContent(article.id)
      .then(d => { setContent(d.content); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [article.id])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleBookmark = async () => {
    await api.toggleBookmark(article.id).catch(() => {})
    setBookmarked(b => !b)
    onBookmark?.()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto py-3 px-2 sm:py-6 sm:px-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-2xl shadow-2xl animate-slide-up my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border rounded-t-2xl px-4 sm:px-6 py-3 sm:py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-white/5 ${meta.pill}`}>
                {meta.emoji} {article.topic}
              </span>
              <span className="text-xs text-muted">{article.source_name}</span>
              <span className="text-xs text-muted ml-auto">{timeAgo(article.published_at)}</span>
            </div>
            <h2 className="text-base font-bold text-white leading-snug">{article.title}</h2>
          </div>
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            {/* Bookmark */}
            <button
              onClick={handleBookmark}
              title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${bookmarked ? 'text-amber-400 bg-amber-500/10' : 'text-muted hover:text-amber-400 hover:bg-amber-500/10'}`}
            >
              <svg className="w-4 h-4" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            {/* Open external */}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in new tab"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-blue-400 hover:bg-blue-500/10 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            {/* Close */}
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-white hover:bg-white/10 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 max-h-[65vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-3 py-4">
              {[100, 80, 90, 70, 95, 60].map((w, i) => (
                <div key={i} className={`skeleton h-3 rounded`} style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-muted text-sm mb-4">Could not extract article content.</p>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open Original Article
              </a>
            </div>
          ) : content ? (
            <SimpleMarkdown text={content} />
          ) : (
            <div className="py-8 text-center">
              <p className="text-muted text-sm mb-4">No readable content found for this article.</p>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open Original Article
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 sm:px-6 py-3 flex items-center gap-3 rounded-b-2xl">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Original
          </a>
          <button onClick={onClose} className="btn-outline text-sm">Close</button>
          <span className="hidden sm:inline ml-auto text-[10px] text-muted">Press Esc to close</span>
        </div>
      </div>
    </div>
  )
}
