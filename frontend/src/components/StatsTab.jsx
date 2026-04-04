import { useState, useEffect } from 'react'
import { api } from '../api'
import { topicMeta } from './TopicFilter'

function StatCard({ label, value, sub, icon, color = 'text-blue-400' }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
      <div className={`text-2xl ${color}`}>{icon}</div>
      <div>
        <p className="text-xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs text-muted">{label}</p>
        {sub && <p className="text-[10px] text-muted/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function MiniBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted truncate w-32 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-300 tabular-nums w-8 text-right">{value}</span>
    </div>
  )
}

function DailyChart({ data }) {
  if (!data?.length) return (
    <div className="h-32 flex items-center justify-center text-muted text-sm">No reading history yet</div>
  )
  const max = Math.max(...data.map(d => d.count), 1)
  // Fill in missing days for the last 30 days
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const found = data.find(r => r.day === key)
    days.push({ day: key, count: found?.count || 0 })
  }
  return (
    <div className="flex items-end gap-0.5 h-24">
      {days.map(({ day, count }) => {
        const h = max > 0 ? Math.round((count / max) * 100) : 0
        const label = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return (
          <div key={day} className="flex-1 flex flex-col items-center justify-end group relative" title={`${label}: ${count} articles`}>
            <div
              className="w-full rounded-t bg-blue-500/60 hover:bg-blue-400 transition-colors min-h-[2px]"
              style={{ height: `${Math.max(h, 2)}%` }}
            />
            {/* Tooltip */}
            {count > 0 && (
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {label}: {count}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function StatsTab({ onToast }) {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    api.getReadingStats().then(d => { setStats(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const handleSendDigest = async () => {
    setSending(true)
    try {
      const r = await api.sendDigest()
      onToast?.(r.message)
    } catch (e) {
      onToast?.(e.message, 'error')
    } finally {
      setSending(false)
    }
  }

  if (loading) return (
    <div className="animate-fade-in flex items-center justify-center py-20 text-muted text-sm">
      Loading stats…
    </div>
  )

  const topTopicMax  = stats?.top_topics?.[0]?.count || 1
  const topSourceMax = stats?.top_sources?.[0]?.count || 1

  const topicColors = ['bg-purple-500','bg-blue-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500','bg-orange-500','bg-violet-500']

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Reading Stats</h2>
          <p className="text-xs text-muted mt-0.5">Your personal reading analytics</p>
        </div>
        <button
          onClick={handleSendDigest}
          disabled={sending}
          className="btn-outline flex items-center gap-2 text-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          {sending ? 'Sending…' : 'Send Digest Now'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="📖" label="Total reads" value={(stats?.total_reads || 0).toLocaleString()} color="text-blue-400" />
        <StatCard icon="📅" label="Days active" value={stats?.days_active || 0} color="text-emerald-400" />
        <StatCard icon="⚡" label="Avg / day" value={stats?.avg_per_day || 0} color="text-amber-400" />
        <StatCard
          icon="🔥"
          label="Reading streak"
          value={`${stats?.streak || 0}d`}
          sub={stats?.streak > 0 ? 'Keep it up!' : 'Start reading today'}
          color="text-orange-400"
        />
      </div>

      {/* Daily chart */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <p className="text-sm font-semibold text-white mb-4">Articles read — last 30 days</p>
        <DailyChart data={stats?.daily} />
        <div className="flex justify-between mt-2 text-[10px] text-muted">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </div>

      {/* Top topics + sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-white mb-4">Top topics read</p>
          {stats?.top_topics?.length ? (
            <div className="flex flex-col gap-2.5">
              {stats.top_topics.map((t, i) => (
                <MiniBar
                  key={t.topic}
                  label={`${topicMeta(t.topic).emoji} ${t.topic}`}
                  value={t.count}
                  max={topTopicMax}
                  color={topicColors[i % topicColors.length]}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted text-sm">No data yet — start reading!</p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-white mb-4">Top sources read</p>
          {stats?.top_sources?.length ? (
            <div className="flex flex-col gap-2.5">
              {stats.top_sources.map((s, i) => (
                <MiniBar
                  key={s.source}
                  label={s.source}
                  value={s.count}
                  max={topSourceMax}
                  color={topicColors[i % topicColors.length]}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted text-sm">No data yet — start reading!</p>
          )}
        </div>
      </div>
    </div>
  )
}
