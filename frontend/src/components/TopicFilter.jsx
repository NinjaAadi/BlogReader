const TOPICS = {
  'All':                { emoji: '✦',  color: 'from-slate-400 to-slate-500',   pill: 'border-slate-500/40 text-slate-300 hover:border-slate-400/60' },
  'AI/ML':              { emoji: '🤖', color: 'from-purple-400 to-violet-500',  pill: 'border-purple-500/40 text-purple-300 hover:border-purple-400' },
  'AI News':            { emoji: '📰', color: 'from-pink-400 to-rose-500',      pill: 'border-pink-500/40 text-pink-300 hover:border-pink-400' },
  'AI Research':        { emoji: '🔬', color: 'from-violet-400 to-indigo-500',  pill: 'border-violet-500/40 text-violet-300 hover:border-violet-400' },
  'Big Tech':           { emoji: '🏢', color: 'from-blue-400 to-blue-600',      pill: 'border-blue-500/40 text-blue-300 hover:border-blue-400' },
  'Streaming':          { emoji: '🎬', color: 'from-red-400 to-rose-600',       pill: 'border-red-500/40 text-red-300 hover:border-red-400' },
  'Ride-share':         { emoji: '🚗', color: 'from-yellow-400 to-amber-500',   pill: 'border-yellow-500/40 text-yellow-300 hover:border-yellow-400' },
  'Social':             { emoji: '💬', color: 'from-cyan-400 to-sky-500',       pill: 'border-cyan-500/40 text-cyan-300 hover:border-cyan-400' },
  'E-commerce':         { emoji: '🛒', color: 'from-orange-400 to-amber-600',   pill: 'border-orange-500/40 text-orange-300 hover:border-orange-400' },
  'Dev Tools':          { emoji: '🔧', color: 'from-emerald-400 to-green-500',  pill: 'border-emerald-500/40 text-emerald-300 hover:border-emerald-400' },
  'Cloud':              { emoji: '☁️', color: 'from-sky-400 to-blue-500',       pill: 'border-sky-500/40 text-sky-300 hover:border-sky-400' },
  'Databases':          { emoji: '🗄️', color: 'from-teal-400 to-emerald-500',   pill: 'border-teal-500/40 text-teal-300 hover:border-teal-400' },
  'Data Engineering':   { emoji: '📊', color: 'from-lime-400 to-green-500',     pill: 'border-lime-500/40 text-lime-300 hover:border-lime-400' },
  'Observability':      { emoji: '📡', color: 'from-indigo-400 to-blue-500',    pill: 'border-indigo-500/40 text-indigo-300 hover:border-indigo-400' },
  'Security':           { emoji: '🔒', color: 'from-rose-400 to-red-600',       pill: 'border-rose-500/40 text-rose-300 hover:border-rose-400' },
  'Fintech':            { emoji: '💰', color: 'from-green-400 to-emerald-600',  pill: 'border-green-500/40 text-green-300 hover:border-green-400' },
  'Startup Engineering':{ emoji: '🚀', color: 'from-amber-400 to-orange-500',   pill: 'border-amber-500/40 text-amber-300 hover:border-amber-400' },
  'Gaming':             { emoji: '🎮', color: 'from-fuchsia-400 to-purple-600', pill: 'border-fuchsia-500/40 text-fuchsia-300 hover:border-fuchsia-400' },
  'Hardware':           { emoji: '🖥️', color: 'from-zinc-400 to-slate-600',     pill: 'border-zinc-500/40 text-zinc-300 hover:border-zinc-400' },
  'Mobile':             { emoji: '📱', color: 'from-blue-300 to-cyan-500',      pill: 'border-blue-400/40 text-blue-200 hover:border-blue-300' },
  'Open Source':        { emoji: '🌐', color: 'from-green-400 to-teal-500',     pill: 'border-green-500/40 text-green-300 hover:border-green-400' },
  'Thought Leadership': { emoji: '💡', color: 'from-slate-300 to-slate-500',    pill: 'border-slate-400/40 text-slate-300 hover:border-slate-300' },
}

export const topicMeta = (topic) =>
  TOPICS[topic] || { emoji: '📝', color: 'from-slate-400 to-slate-500', pill: 'border-slate-500/40 text-slate-300' }

export const topicColor = (topic) => {
  const meta = TOPICS[topic]
  if (!meta) return 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  // derive a bg/text/border from pill
  return meta.pill.replace('border-', 'bg-').replace(/\/40.*/, '/15 ') +
    meta.pill.replace('hover:border.*', '')
}

export default function TopicFilter({ topics, selected, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((topic) => {
        const meta = topicMeta(topic)
        const isActive = selected === topic
        return (
          <button
            key={topic}
            onClick={() => onSelect(topic)}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
              border transition-all duration-150 cursor-pointer select-none
              ${isActive
                ? `bg-gradient-to-r ${meta.color} text-white border-transparent shadow-lg`
                : `bg-transparent ${meta.pill} hover:bg-white/5`
              }
            `}
          >
            <span className="text-[13px] leading-none">{meta.emoji}</span>
            {topic}
          </button>
        )
      })}
    </div>
  )
}
