import { useState, useRef } from 'react'
import { topicMeta } from './TopicFilter'
import { api } from '../api'

export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date)) return ''
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff <= 0) return 'just now'  // future-dated articles (pre-published feeds)
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isNew(dateStr) {
  if (!dateStr) return false
  return (Date.now() - new Date(dateStr).getTime()) / 1000 < 86400 * 2
}

function getFavicon(url) {
  try {
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${host}&sz=16`
  } catch { return null }
}

const ACCENT_MAP = {
  'AI/ML':               'border-l-purple-500',
  'AI News':             'border-l-pink-500',
  'AI Research':         'border-l-violet-500',
  'Big Tech':            'border-l-blue-500',
  'Streaming':           'border-l-red-500',
  'Ride-share':          'border-l-yellow-500',
  'Social':              'border-l-cyan-500',
  'E-commerce':          'border-l-orange-500',
  'Dev Tools':           'border-l-emerald-500',
  'Cloud':               'border-l-sky-500',
  'Databases':           'border-l-teal-500',
  'Data Engineering':    'border-l-lime-500',
  'Observability':       'border-l-indigo-500',
  'Security':            'border-l-rose-500',
  'Fintech':             'border-l-green-500',
  'Startup Engineering': 'border-l-amber-500',
  'Gaming':              'border-l-fuchsia-500',
  'Hardware':            'border-l-zinc-400',
  'Mobile':              'border-l-blue-300',
  'Open Source':         'border-l-green-400',
  'Thought Leadership':  'border-l-slate-400',
}

export default function BlogCard({ article, onSeen, onBookmark, onRead }) {
  const [seen, setSeen]           = useState(!!article.is_seen)
  const [bookmarked, setBookmarked] = useState(!!article.is_bookmarked)
  const meta = topicMeta(article.topic)
  const accentBorder = ACCENT_MAP[article.topic] || 'border-l-slate-500'
  const favicon = getFavicon(article.url)

  const longPressTimer = useRef(null)
  const didLongPress = useRef(false)

  const handleTouchStart = () => {
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      if (navigator.vibrate) navigator.vibrate(40)
      onRead?.(article)
    }, 500)
  }

  const cancelLongPress = () => clearTimeout(longPressTimer.current)

  const handleOpen = async (e) => {
    if (didLongPress.current) return
    window.open(article.url, '_blank', 'noopener,noreferrer')
    if (!seen) {
      setSeen(true)
      await api.markSeen(article.id).catch(() => {})
      onSeen?.(article.id)
    }
  }

  const handleBookmark = async (e) => {
    e.stopPropagation()
    const next = !bookmarked
    setBookmarked(next)
    await api.toggleBookmark(article.id).catch(() => setBookmarked(!next))
    onBookmark?.()
  }

  return (
    <article
      onClick={handleOpen}
      onTouchStart={handleTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      className={`
        group relative flex flex-col bg-card border border-border rounded-xl p-4
        border-l-2 ${accentBorder}
        cursor-pointer transition-all duration-200
        hover:bg-card-hover hover:border-white/10 hover:border-l-[3px]
        hover:shadow-2xl hover:shadow-black/40 hover:-translate-y-0.5
        ${seen ? 'opacity-50' : ''}
      `}
    >
      {/* Top-right actions */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
        {isNew(article.published_at) && !seen && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
            New
          </span>
        )}
        {onRead && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(article) }}
            title="Read in-app"
            className="p-1 rounded-md text-muted opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:text-blue-400 hover:bg-blue-400/10 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </button>
        )}
        <button
          onClick={handleBookmark}
          title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          className={`p-1 rounded-md transition-all ${
            bookmarked
              ? 'text-amber-400 bg-amber-400/10'
              : 'text-muted opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:text-amber-400 hover:bg-amber-400/10'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
      </div>

      {/* Topic badge */}
      <div className="flex items-center gap-2 mb-2.5 pr-16">
        <span className={`
          inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide
          px-2 py-0.5 rounded-full border
          ${meta.pill.replace('hover:border-[^ ]+', '').replace('hover:[^ ]+', '')}
          bg-white/5
        `}>
          <span>{meta.emoji}</span>
          {article.topic}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-slate-100 leading-snug mb-2 line-clamp-2 group-hover:text-white transition-colors">
        {article.title}
      </h3>

      {/* Summary */}
      {article.summary && (
        <p className="text-xs text-muted leading-relaxed line-clamp-2 mb-3 flex-1">
          {article.summary}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border/60">
        {favicon && (
          <img
            src={favicon}
            alt=""
            className="w-3.5 h-3.5 rounded-sm opacity-70 group-hover:opacity-100 transition-opacity"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}
        <span className="text-xs text-slate-400 font-medium truncate flex-1 group-hover:text-slate-300 transition-colors">
          {article.source_name}
        </span>
        <span className="text-[11px] text-muted tabular-nums shrink-0">
          {timeAgo(article.published_at)}
        </span>
        <svg className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </div>
    </article>
  )
}
