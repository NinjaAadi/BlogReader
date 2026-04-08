import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './api'
import TopicFilter, { topicMeta } from './components/TopicFilter'
import BlogCard, { timeAgo } from './components/BlogCard'
import StatsBar from './components/StatsBar'
import SourcesTab from './components/SourcesTab'
import StatsTab from './components/StatsTab'
import ArticleReader from './components/ArticleReader'

const PER_PAGE = 50
const TABS = ['Feed', 'Bookmarks', 'History', 'Sources', 'Stats']

export default function App() {
  const [activeTab, setActiveTab] = useState('Feed')

  const [stats, setStats]       = useState(null)
  const [topics, setTopics]     = useState(['All'])
  const [sources, setSources]   = useState([])
  const [articles, setArticles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError]       = useState(null)

  // Feed filters — initialised from URL so they survive page refresh
  const [activeTopic, setActiveTopic]   = useState(() => new URLSearchParams(window.location.search).get('topic') || 'All')
  const [activeSource, setActiveSource] = useState(() => new URLSearchParams(window.location.search).get('source') || 'All')
  const [showUnread, setShowUnread]     = useState(() => new URLSearchParams(window.location.search).get('unread') === 'true')
  const [search, setSearch]             = useState(() => new URLSearchParams(window.location.search).get('search') || '')
  const [sinceDays, setSinceDays]       = useState(() => { const d = new URLSearchParams(window.location.search).get('days'); return d ? Number(d) : null })
  const [page, setPage]                 = useState(1)
  const searchTimer = useRef(null)

  // Bookmarks/History
  const [bookmarks, setBookmarks]     = useState([])
  const [history, setHistory]         = useState([])
  const [listPage, setListPage]       = useState(1)
  const [listLoading, setListLoading] = useState(false)

  // Random article modal
  const [randomArticle, setRandomArticle] = useState(null)
  const [loadingRandom, setLoadingRandom] = useState(false)

  // In-app reader
  const [readerArticle, setReaderArticle] = useState(null)

  // Keyboard nav
  const [focusedIdx, setFocusedIdx] = useState(-1)

  // Trending
  const [trending, setTrending] = useState([])

  // Toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  // ── Data loading ──────────────────────────────────────

  const loadStats = useCallback(async () => {
    const d = await api.getStats().catch(() => null)
    if (d) setStats(d)
  }, [])

  const loadTopics = useCallback(async () => {
    const d = await api.getTopics().catch(() => ({ topics: ['All'] }))
    setTopics(d.topics || ['All'])
  }, [])

  const loadSources = useCallback(async (topic, resetSource = true) => {
    const d = await api.getSources(topic).catch(() => ({ sources: [] }))
    setSources(d.sources || [])
    if (resetSource) setActiveSource('All')
  }, [])

  const loadArticles = useCallback(async (filters = {}) => {
    setLoading(true); setError(null)
    try {
      const d = await api.getArticles({
        topic:     filters.topic     ?? activeTopic,
        source:    filters.source    ?? activeSource,
        seen:      (filters.showUnread ?? showUnread) ? false : undefined,
        search:    filters.search    !== undefined ? filters.search : search,
        sinceDays: filters.sinceDays !== undefined ? filters.sinceDays : sinceDays,
        page:      filters.page      ?? page,
        perPage:   PER_PAGE,
      })
      setArticles(d.articles || [])
      setFocusedIdx(-1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeTopic, activeSource, showUnread, search, sinceDays, page])

  const loadBookmarks = useCallback(async (p = 1) => {
    setListLoading(true)
    const d = await api.getBookmarks({ page: p }).catch(() => ({ bookmarks: [] }))
    setBookmarks(d.bookmarks || [])
    setListLoading(false)
  }, [])

  const loadHistory = useCallback(async (p = 1) => {
    setListLoading(true)
    const d = await api.getHistory({ page: p }).catch(() => ({ history: [] }))
    setHistory(d.history || [])
    setListLoading(false)
  }, [])

  const loadTrending = useCallback(async () => {
    const d = await api.getTrending(48).catch(() => ({}))
    const list = Array.isArray(d) ? d : (d?.trending || [])
    setTrending(list.slice(0, 12))
  }, [])

  // Sync filter state to URL so filters survive page refresh
  useEffect(() => {
    const p = new URLSearchParams()
    if (activeTopic !== 'All') p.set('topic', activeTopic)
    if (activeSource !== 'All') p.set('source', activeSource)
    if (showUnread) p.set('unread', 'true')
    if (sinceDays) p.set('days', String(sinceDays))
    if (search.trim()) p.set('search', search.trim())
    const qs = p.toString()
    history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [activeTopic, activeSource, showUnread, sinceDays, search])

  // Initial load — pass false to loadSources so it doesn't reset the source we read from the URL
  useEffect(() => {
    Promise.all([loadStats(), loadTopics(), loadSources(activeTopic, false), loadTrending()])
    loadArticles()
    const interval = setInterval(() => { loadStats(); loadTrending(); loadArticles() }, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Reload feed when filters change
  useEffect(() => {
    setPage(1)
    loadArticles({ topic: activeTopic, source: activeSource, showUnread, sinceDays, page: 1 })
  }, [activeTopic, activeSource, showUnread, sinceDays])

  useEffect(() => { loadArticles() }, [page])

  // Load bookmarks/history when tab switches
  useEffect(() => {
    setListPage(1)
    if (activeTab === 'Bookmarks') loadBookmarks(1)
    if (activeTab === 'History')   loadHistory(1)
  }, [activeTab])

  // ── Keyboard shortcuts ─────────────────────────────────

  useEffect(() => {
    if (activeTab !== 'Feed') return
    const handler = (e) => {
      // Don't trigger if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (readerArticle) return // reader handles its own keys

      switch (e.key) {
        case 'j': case 'ArrowDown':
          e.preventDefault()
          setFocusedIdx(i => Math.min(i + 1, articles.length - 1))
          break
        case 'k': case 'ArrowUp':
          e.preventDefault()
          setFocusedIdx(i => Math.max(i - 1, 0))
          break
        case 'Enter': {
          if (focusedIdx >= 0 && articles[focusedIdx]) {
            setReaderArticle(articles[focusedIdx])
          }
          break
        }
        case 'o': {
          if (focusedIdx >= 0 && articles[focusedIdx]) {
            window.open(articles[focusedIdx].url, '_blank', 'noopener,noreferrer')
          }
          break
        }
        case 'b': {
          if (focusedIdx >= 0 && articles[focusedIdx]) {
            api.toggleBookmark(articles[focusedIdx].id).then(() => loadStats()).catch(() => {})
            showToast('Bookmark toggled')
          }
          break
        }
        case 'u':
          e.preventDefault()
          setShowUnread(v => !v)
          break
        case 'm':
          e.preventDefault()
          handleMarkAllSeen()
          break
        case '/':
          e.preventDefault()
          document.getElementById('feed-search')?.focus()
          break
        default:
          break
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeTab, articles, focusedIdx, readerArticle])

  // ── Handlers ──────────────────────────────────────────

  const handleTopicChange = (t) => { setActiveTopic(t); loadSources(t) }

  const handleFetchNow = async () => {
    setFetching(true)
    try {
      await api.triggerFetch()
      showToast('Fetch started — new articles will appear shortly.')
      setTimeout(() => { loadStats(); loadArticles() }, 4000)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setFetching(false)
    }
  }

  const handleRandomUnseen = async () => {
    setLoadingRandom(true)
    try {
      setRandomArticle(await api.getRandomUnseen())
    } catch {
      showToast('No unseen articles available!', 'error')
    } finally {
      setLoadingRandom(false)
    }
  }

  const handleClearHistory = async () => {
    if (!confirm('Clear all reading history? This cannot be undone.')) return
    const r = await api.clearHistory().catch(() => null)
    if (r) {
      showToast(`Cleared ${r.cleared} history entries.`)
      setHistory([])
      loadStats()
    }
  }

  const handleDownloadBackup = async () => {
    try {
      const blob = await api.downloadBackup()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url; a.download = `blog-notifier-backup-${date}.json`
      a.click(); URL.revokeObjectURL(url)
      showToast('Bookmarks + history backup downloaded.')
    } catch { showToast('Backup failed.', 'error') }
  }

  const handleDownloadFullBackup = async () => {
    try {
      showToast('Preparing full database backup…')
      const blob = await api.downloadFullBackup()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url; a.download = `blog-notifier-full-${date}.sqlite`
      a.click(); URL.revokeObjectURL(url)
      showToast('Full DB backup downloaded.')
    } catch { showToast('Full backup failed.', 'error') }
  }

  const handleSearchChange = (val) => {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      loadArticles({ search: val, page: 1 })
    }, 400)
  }

  const handleRestoreBackup = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const r = await api.restoreBackup(data)
      showToast(`Restored: ${r.restored_bookmarks} bookmarks, ${r.restored_history} history entries.`)
      loadStats(); loadBookmarks(1); loadHistory(1)
    } catch { showToast('Restore failed — invalid file.', 'error') }
    e.target.value = ''
  }

  const handleRestoreFullDb = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const confirmed = confirm(
      `Full Database Restore\n\n` +
      `You are about to restore the complete database from:\n"${file.name}"\n\n` +
      `This will:\n` +
      `• Replace ALL current articles, bookmarks, history, and sources\n` +
      `• Restore everything exactly as it was when the backup was taken\n` +
      `• Require a server restart to take effect\n\n` +
      `This CANNOT be undone. Continue?`
    )
    if (!confirmed) { e.target.value = ''; return }
    showToast('Uploading and restoring full database…')
    try {
      const r = await api.restoreFullDb(file)
      showToast('Full DB restored! Please restart the server for changes to take full effect.')
    } catch (err) {
      showToast(err.message, 'error')
    }
    e.target.value = ''
  }

  const handleMarkAllSeen = async () => {
    try {
      const r = await api.markAllSeen({
        topic: activeTopic,
        source: activeSource,
        search,
        sinceDays,
      })
      showToast(`Marked ${r.marked} articles as read.`)
      loadStats()
      loadArticles()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const filtered = articles

  return (
    <div className="min-h-screen bg-bg flex flex-col overflow-x-hidden">

      {/* ── Header ── */}
      <header className="relative bg-surface border-b border-border overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                <span className="text-white">Blog</span>
                <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"> Notifier</span>
              </h1>
              <p className="text-[11px] text-muted leading-none mt-0.5">
                {stats?.active_sources ?? '—'}+ sources · live feed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleRandomUnseen} disabled={loadingRandom} className="btn-outline flex items-center gap-2 text-sm">
              <span className={loadingRandom ? 'animate-spin inline-block' : ''}>{loadingRandom ? '↻' : '🎲'}</span>
              <span className="hidden sm:inline">{loadingRandom ? 'Finding…' : 'Random Unread'}</span>
            </button>
            <button onClick={handleFetchNow} disabled={fetching} className="btn-primary flex items-center gap-2 text-sm">
              <svg className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">{fetching ? 'Fetching…' : 'Fetch Now'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Stats bar ── */}
      <StatsBar stats={stats} onFetch={handleFetchNow} fetching={fetching} />

      {/* ── Tabs ── */}
      <div className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map(tab => {
              const count = tab === 'Bookmarks'
                ? stats?.bookmarked_articles
                : tab === 'Feed'
                  ? stats?.unread_articles
                  : undefined
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`
                    relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap
                    ${activeTab === tab
                      ? 'text-white border-b-2 border-blue-500'
                      : 'text-muted hover:text-slate-300 border-b-2 border-transparent'
                    }
                  `}
                >
                  {tab === 'Feed'      && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>}
                  {tab === 'Bookmarks' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>}
                  {tab === 'History'   && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                  {tab === 'Sources'   && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>}
                  {tab === 'Stats'     && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                  {tab}
                  {count != null && count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      activeTab === tab ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-muted'
                    }`}>
                      {count.toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}

            {/* Backup/Restore — right-aligned */}
            <div className="ml-auto flex items-center gap-1 py-2 flex-shrink-0">
              <button
                onClick={handleDownloadBackup}
                title="Download bookmarks + history as JSON"
                className="btn-ghost flex items-center gap-1.5 text-xs py-1.5 px-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="hidden sm:inline">Backup</span>
              </button>
              <button
                onClick={handleDownloadFullBackup}
                title="Download full SQLite database (all articles)"
                className="btn-ghost flex items-center gap-1.5 text-xs py-1.5 px-2 text-amber-400/80 hover:text-amber-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                <span className="hidden sm:inline">Full DB</span>
              </button>
              <label title="Restore bookmarks + history from JSON" className="btn-ghost flex items-center gap-1.5 text-xs py-1.5 px-2 cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="hidden sm:inline">Restore</span>
                <input type="file" accept=".json" className="hidden" onChange={handleRestoreBackup} />
              </label>
              <label title="Restore full database from .sqlite backup" className="btn-ghost flex items-center gap-1.5 text-xs py-1.5 px-2 cursor-pointer text-amber-400/80 hover:text-amber-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                <span className="hidden sm:inline">Restore DB</span>
                <input type="file" accept=".sqlite,.db" className="hidden" onChange={handleRestoreFullDb} />
              </label>
            </div>
          </nav>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-4 sm:gap-5">

        {/* ── Feed tab ── */}
        {activeTab === 'Feed' && (
          <>
            <TopicFilter topics={topics} selected={activeTopic} onSelect={handleTopicChange} />

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
              <SourcePicker sources={sources} value={activeSource} onChange={setActiveSource} />

              <div className="relative flex-1 min-w-0">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  id="feed-search"
                  type="text"
                  value={search}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search articles… (press /)"
                  className="input w-full pl-9 pr-4 py-2"
                />
                {search && (
                  <button onClick={() => { handleSearchChange('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              </div>{/* end source+search row */}

              <div className="flex flex-wrap items-center gap-2 sm:contents">
              <button
                onClick={() => setShowUnread(!showUnread)}
                className={`btn flex items-center gap-2 text-xs border transition-all ${
                  showUnread
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30'
                    : 'btn-outline'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill={showUnread ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Unread only
              </button>

              {/* Time filter */}
              <div className="flex items-center gap-1 bg-surface border border-border rounded-lg px-1 py-1">
                {[['All', null], ['Today', 1], ['Week', 7], ['Month', 30]].map(([label, days]) => (
                  <button
                    key={label}
                    onClick={() => setSinceDays(days)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      sinceDays === days
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-muted hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Mark all read */}
              <button
                onClick={handleMarkAllSeen}
                title="Mark all visible articles as read (M)"
                className="btn-outline flex items-center gap-1.5 text-xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="hidden sm:inline">Mark all read</span>
              </button>

              <span className="ml-auto text-xs text-muted">
                <span className="text-slate-300 font-medium">{filtered.length}</span>{' '}
                article{filtered.length !== 1 ? 's' : ''}
              </span>
              </div>{/* end controls row */}
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="hidden md:flex items-center gap-4 text-[10px] text-muted/60 -mt-2">
              <span><kbd className="bg-white/5 border border-border px-1 rounded text-[9px]">j/k</kbd> navigate</span>
              <span><kbd className="bg-white/5 border border-border px-1 rounded text-[9px]">Enter</kbd> read in-app</span>
              <span><kbd className="bg-white/5 border border-border px-1 rounded text-[9px]">o</kbd> open external</span>
              <span><kbd className="bg-white/5 border border-border px-1 rounded text-[9px]">b</kbd> bookmark</span>
              <span><kbd className="bg-white/5 border border-border px-1 rounded text-[9px]">u</kbd> toggle unread</span>
              <span><kbd className="bg-white/5 border border-border px-1 rounded text-[9px]">m</kbd> mark all read</span>
              <span><kbd className="bg-white/5 border border-border px-1 rounded text-[9px]">/</kbd> search</span>
            </div>

            {/* Trending strip */}
            {trending.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted font-medium flex-shrink-0">Trending:</span>
                {trending.map(({ word, count }) => (
                  <button
                    key={word}
                    onClick={() => handleSearchChange(word)}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-border hover:border-blue-500/50 hover:bg-blue-500/5 text-muted hover:text-blue-300 transition-all"
                  >
                    {word}
                    <span className="opacity-50">{count}</span>
                  </button>
                ))}
              </div>
            )}

            {loading ? <SkeletonGrid /> : error ? (
              <ErrorState message={error} onRetry={() => loadArticles()} />
            ) : filtered.length === 0 ? <EmptyState /> : (
              <div className="animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.map((article, idx) => (
                    <div
                      key={article.id}
                      className={focusedIdx === idx ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-bg rounded-xl' : ''}
                      onClick={() => setFocusedIdx(idx)}
                    >
                      <BlogCard
                        article={article}
                        onSeen={() => loadStats()}
                        onBookmark={() => loadStats()}
                        onRead={() => setReaderArticle(article)}
                      />
                    </div>
                  ))}
                </div>
                {(page > 1 || filtered.length === PER_PAGE) && (
                  <div className="flex justify-center items-center gap-3 mt-8">
                    {page > 1 && (
                      <button onClick={() => setPage(page - 1)} className="btn-outline text-sm flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        Previous
                      </button>
                    )}
                    <span className="px-4 py-2 rounded-lg border border-border text-sm text-muted tabular-nums">Page {page}</span>
                    {filtered.length === PER_PAGE && (
                      <button onClick={() => setPage(page + 1)} className="btn-outline text-sm flex items-center gap-1.5">
                        Next
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Bookmarks tab ── */}
        {activeTab === 'Bookmarks' && (
          <div className="animate-fade-in flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Saved Bookmarks</h2>
                <p className="text-xs text-muted mt-0.5">Articles you bookmarked — click the star on any article to add</p>
              </div>
              <span className="text-xs text-muted tabular-nums">
                {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}
              </span>
            </div>

            {listLoading ? <SkeletonGrid /> : bookmarks.length === 0 ? (
              <ListEmptyState
                icon="🔖"
                title="No bookmarks yet"
                desc="Hover over any article and click the star icon to bookmark it"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {bookmarks.map(article => (
                  <BlogCard key={article.id} article={article}
                    onSeen={() => loadStats()}
                    onBookmark={() => { loadBookmarks(listPage); loadStats() }}
                    onRead={() => setReaderArticle(article)}
                  />
                ))}
              </div>
            )}
            <ListPagination
              page={listPage}
              items={bookmarks}
              perPage={PER_PAGE}
              onPrev={() => { setListPage(p => p - 1); loadBookmarks(listPage - 1) }}
              onNext={() => { setListPage(p => p + 1); loadBookmarks(listPage + 1) }}
            />
          </div>
        )}

        {/* ── History tab ── */}
        {activeTab === 'History' && (
          <div className="animate-fade-in flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Reading History</h2>
                <p className="text-xs text-muted mt-0.5">Articles you've opened — most recent first</p>
              </div>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="btn-outline flex items-center gap-1.5 text-xs text-rose-400 border-rose-500/30 hover:border-rose-500/50 hover:text-rose-300"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear History
                </button>
              )}
            </div>

            {listLoading ? <SkeletonGrid /> : history.length === 0 ? (
              <ListEmptyState
                icon="🕐"
                title="No history yet"
                desc="Articles you open will appear here"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {history.map(article => (
                  <BlogCard key={article.id} article={article}
                    onSeen={() => {}}
                    onBookmark={() => loadStats()}
                    onRead={() => setReaderArticle(article)}
                  />
                ))}
              </div>
            )}
            <ListPagination
              page={listPage}
              items={history}
              perPage={PER_PAGE}
              onPrev={() => { setListPage(p => p - 1); loadHistory(listPage - 1) }}
              onNext={() => { setListPage(p => p + 1); loadHistory(listPage + 1) }}
            />
          </div>
        )}

        {/* ── Sources tab ── */}
        {activeTab === 'Sources' && (
          <SourcesTab onToast={showToast} />
        )}

        {/* ── Stats tab ── */}
        {activeTab === 'Stats' && (
          <StatsTab onToast={showToast} />
        )}

      </main>

      {/* ── Random Article Modal ── */}
      {randomArticle && (
        <Modal onClose={() => setRandomArticle(null)}>
          <RandomArticleModal
            article={randomArticle}
            onClose={() => { setRandomArticle(null); loadStats() }}
            onRead={(a) => { setRandomArticle(null); setReaderArticle(a) }}
          />
        </Modal>
      )}

      {/* ── In-app Article Reader ── */}
      {readerArticle && (
        <ArticleReader
          article={readerArticle}
          onClose={() => { setReaderArticle(null); loadStats() }}
          onBookmark={() => loadStats()}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`
          fixed bottom-6 right-6 z-50 animate-slide-up
          flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium border
          ${toast.type === 'error'
            ? 'bg-rose-950 text-rose-100 border-rose-800/60'
            : 'bg-emerald-950 text-emerald-100 border-emerald-800/60'
          }
        `}>
          {toast.type === 'error'
            ? <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            : <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          }
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function RandomArticleModal({ article, onClose, onRead }) {
  const meta = topicMeta(article.topic)
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎲</span>
          <h2 className="text-base font-bold text-white">Random Unread</h2>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border bg-white/5 ${meta.pill.replace(/hover:[^ ]+/g, '')}`}>
          {meta.emoji} {article.topic}
        </span>
        <span className="text-sm text-muted">{article.source_name}</span>
        <span className="ml-auto text-xs text-muted">{timeAgo(article.published_at)}</span>
      </div>

      <h3 className="text-base font-semibold text-white leading-snug mb-3">{article.title}</h3>

      {article.summary && (
        <p className="text-sm text-muted leading-relaxed mb-4 line-clamp-3">{article.summary}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onRead(article)}
          className="btn-outline inline-flex items-center gap-2 flex-1 justify-center text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Read In-App
        </button>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="btn-primary inline-flex items-center gap-2 flex-1 justify-center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open External
        </a>
      </div>
    </div>
  )
}

function ListEmptyState({ icon, title, desc }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-28 text-center animate-fade-in">
      <div className="text-5xl mb-4 opacity-60">{icon}</div>
      <p className="text-white font-semibold mb-1">{title}</p>
      <p className="text-muted text-sm">{desc}</p>
    </div>
  )
}

function ListPagination({ page, items, perPage, onPrev, onNext }) {
  if (items.length < perPage && page === 1) return null
  return (
    <div className="flex justify-center items-center gap-3 mt-4">
      {page > 1 && (
        <button onClick={onPrev} className="btn-outline text-sm flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Previous
        </button>
      )}
      <span className="px-4 py-2 rounded-lg border border-border text-sm text-muted tabular-nums">Page {page}</span>
      {items.length === perPage && (
        <button onClick={onNext} className="btn-outline text-sm flex items-center gap-1.5">
          Next
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="skeleton h-4 w-20 rounded-full" />
            <div className="skeleton h-3 w-10 rounded" />
          </div>
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-4/5 rounded" />
          <div className="skeleton h-3 w-3/5 rounded mt-1" />
          <div className="border-t border-border/60 pt-2 mt-1">
            <div className="skeleton h-3 w-28 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-28 text-center animate-fade-in">
      <div className="text-5xl mb-4 opacity-60">📭</div>
      <p className="text-white font-semibold mb-1">No articles found</p>
      <p className="text-muted text-sm">Try adjusting your filters or trigger a manual fetch</p>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-28 text-center animate-fade-in">
      <div className="text-5xl mb-4 opacity-60">⚠️</div>
      <p className="text-white font-semibold mb-1">Could not load articles</p>
      <p className="text-muted text-sm mb-5">{message}</p>
      <button onClick={onRetry} className="btn-primary text-sm">Retry</button>
    </div>
  )
}

function SourcePicker({ sources, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const filtered = query.trim()
    ? sources.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : sources

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const select = (name) => {
    onChange(name)
    setOpen(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      {open ? (
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search sources…"
          className="input pl-3 pr-8 py-2 w-44 text-sm"
        />
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="input appearance-none pl-3 pr-8 py-2 cursor-pointer text-left w-44 truncate text-sm"
        >
          {value === 'All' ? 'All Sources' : value}
        </button>
      )}
      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-border rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
          <div
            className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 ${value === 'All' ? 'text-blue-400' : 'text-muted'}`}
            onMouseDown={() => select('All')}
          >
            All Sources
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted/50 italic">No sources match</div>
          ) : filtered.map(s => (
            <div
              key={s.id}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 truncate ${value === s.name ? 'text-blue-400' : 'text-slate-300'}`}
              onMouseDown={() => select(s.name)}
            >
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
