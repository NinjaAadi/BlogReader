export default function StatsBar({ stats, onFetch, fetching }) {
  return (
    <div className="border-b border-border bg-surface/80 backdrop-blur-sm px-4 sm:px-6 py-2 sm:py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-5 gap-y-1">
          <StatChip
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            }
            label="Articles"
            value={stats?.total_articles}
          />
          <StatChip
            icon={
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            }
            label="Unread"
            value={stats?.unread_articles}
            highlight
          />
          <StatChip
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            }
            label="Sources"
            value={stats?.active_sources}
          />
          {stats?.db_size_mb != null && (
            <StatChip
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              }
              label="DB"
              value={`${stats.db_size_mb} MB`}
              raw
            />
          )}
        </div>

        <div className="hidden sm:flex ml-auto items-center gap-2">
          {/* Live indicator */}
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
            Live
          </span>

          <button
            onClick={onFetch}
            disabled={fetching}
            className="btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <svg className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {fetching ? 'Fetching…' : 'Fetch Now'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatChip({ icon, label, value, highlight, raw }) {
  const display = value == null
    ? '—'
    : raw
      ? value
      : Number(value).toLocaleString()
  return (
    <div className="flex items-center gap-1.5">
      <span className={highlight ? 'text-blue-400' : 'text-muted'}>{icon}</span>
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${highlight ? 'text-blue-300' : 'text-slate-200'}`}>
        {display}
      </span>
    </div>
  )
}
