import { useState, useEffect } from 'react'
import { api } from '../api'
import { topicMeta } from './TopicFilter'

const ALL_TOPICS = [
  'AI/ML','AI News','AI Research','Big Tech','Streaming','Ride-share','Social',
  'E-commerce','Dev Tools','Cloud','Databases','Data Engineering','Observability',
  'Security','Fintech','Startup Engineering','Gaming','Hardware','Mobile',
  'Open Source','Thought Leadership',
]

function SourceRow({ source, onToggle, onDelete }) {
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting]  = useState(false)
  const meta = topicMeta(source.topic)

  const handleToggle = async () => {
    setToggling(true)
    await api.toggleSource(source.id, !source.active).catch(() => {})
    onToggle(source.id, !source.active)
    setToggling(false)
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${source.name}"? This cannot be undone.`)) return
    setDeleting(true)
    await api.deleteSource(source.id).catch(() => {})
    onDelete(source.id)
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-border/40 hover:bg-white/[0.02] transition-colors ${deleting ? 'opacity-40 pointer-events-none' : ''}`}>
      {/* Active toggle */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        title={source.active ? 'Disable source' : 'Enable source'}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${source.active ? 'bg-blue-600' : 'bg-white/10'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${source.active ? 'left-4' : 'left-0.5'}`} />
      </button>

      {/* Topic badge */}
      <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${meta.pill} bg-white/5`}>
        {meta.emoji} {source.topic}
      </span>

      {/* Name + URL */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{source.name}</p>
        <p className="text-[11px] text-muted truncate">{source.url}</p>
      </div>

      {/* Stats */}
      <div className="hidden md:flex flex-col items-end text-[10px] text-muted flex-shrink-0">
        {source.error_count > 0 && (
          <span className="text-red-400">{source.error_count} errors</span>
        )}
        {source.last_fetched && (
          <span>{new Date(source.last_fetched).toLocaleDateString()}</span>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        title="Delete source"
        className="p-1.5 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}

function AddSourceForm({ topics, onAdd }) {
  const [open, setOpen]     = useState(false)
  const [name, setName]     = useState('')
  const [url, setUrl]       = useState('')
  const [topic, setTopic]   = useState(topics[0] || 'Dev Tools')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    setSaving(true); setErr('')
    try {
      const r = await api.addSource({ name: name.trim(), url: url.trim(), topic })
      onAdd(r.source)
      setName(''); setUrl(''); setOpen(false)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border hover:border-blue-500/50 hover:bg-blue-500/5 text-sm text-muted hover:text-blue-300 transition-all w-full"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Add custom RSS source
    </button>
  )

  return (
    <form onSubmit={handleSubmit} className="border border-blue-500/30 bg-blue-500/5 rounded-xl p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold text-blue-300">Add new RSS source</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Source name (e.g. My Blog)"
          className="input px-3 py-2 text-sm"
          required
        />
        <input
          type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="RSS feed URL"
          className="input px-3 py-2 text-sm"
          required
        />
        <select value={topic} onChange={e => setTopic(e.target.value)} className="input px-3 py-2 text-sm">
          {ALL_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2">
          {saving ? 'Adding…' : 'Add Source'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-outline text-sm px-4 py-2">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function SourcesTab({ onToast }) {
  const [sources, setSources]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterTopic, setFilter]  = useState('All')
  const [filterActive, setActive] = useState('all') // 'all' | 'active' | 'inactive'

  useEffect(() => {
    api.getSources().then(d => { setSources(d.sources || []); setLoading(false) })
  }, [])

  const handleToggle = (id, newActive) => {
    setSources(s => s.map(src => src.id === id ? { ...src, active: newActive ? 1 : 0 } : src))
  }

  const handleDelete = (id) => {
    setSources(s => s.filter(src => src.id !== id))
    onToast?.('Source deleted.')
  }

  const handleAdd = (src) => {
    setSources(s => [...s, src])
    onToast?.(`Added "${src.name}"`)
  }

  const topics = ['All', ...new Set(sources.map(s => s.topic).filter(Boolean).sort())]

  const visible = sources.filter(s => {
    if (filterTopic !== 'All' && s.topic !== filterTopic) return false
    if (filterActive === 'active'   && !s.active) return false
    if (filterActive === 'inactive' &&  s.active) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !s.url.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const activeCount   = sources.filter(s => s.active).length
  const errorCount    = sources.filter(s => s.error_count > 0).length

  return (
    <div className="animate-fade-in flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Source Management</h2>
          <p className="text-xs text-muted mt-0.5">
            {activeCount} active · {sources.length - activeCount} disabled
            {errorCount > 0 && <span className="text-red-400 ml-2">· {errorCount} with errors</span>}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search sources…" className="input w-full pl-9 pr-3 py-2 text-sm" />
        </div>
        <select value={filterTopic} onChange={e => setFilter(e.target.value)} className="input px-3 py-2 text-sm">
          {topics.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {[['all','All'],['active','Active'],['inactive','Off']].map(([v,l]) => (
            <button key={v} onClick={() => setActive(v)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${filterActive === v ? 'bg-blue-600 text-white' : 'text-muted hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted self-center">{visible.length} sources</span>
      </div>

      {/* Add form */}
      <AddSourceForm topics={ALL_TOPICS} onAdd={handleAdd} />

      {/* List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted text-sm">Loading sources…</div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">No sources match your filters</div>
        ) : visible.map(src => (
          <SourceRow key={src.id} source={src} onToggle={handleToggle} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  )
}
