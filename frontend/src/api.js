const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  getStats: () => request('/stats'),

  getTopics: () => request('/topics'),

  getSources: (topic) => request(`/sources${topic && topic !== 'All' ? `?topic=${encodeURIComponent(topic)}` : ''}`),

  getArticles: ({ topic, source, seen, search, sinceDays, page = 1, perPage = 50 } = {}) => {
    const params = new URLSearchParams()
    if (topic && topic !== 'All') params.set('topic', topic)
    if (source && source !== 'All') params.set('source', source)
    if (seen !== undefined && seen !== null) params.set('seen', seen)
    if (search && search.trim()) params.set('search', search.trim())
    if (sinceDays) params.set('since_days', sinceDays)
    params.set('page', page)
    params.set('per_page', perPage)
    return request(`/articles?${params}`)
  },

  getRandomUnseen: () => request('/articles/random/unseen'),

  markSeen: (id) =>
    request(`/articles/${id}/seen`, { method: 'POST' }),

  toggleBookmark: (id) =>
    request(`/articles/${id}/bookmark`, { method: 'POST' }),

  getBookmarks: ({ page = 1, perPage = 50 } = {}) =>
    request(`/bookmarks?page=${page}&per_page=${perPage}`),

  getHistory: ({ page = 1, perPage = 50 } = {}) =>
    request(`/history?page=${page}&per_page=${perPage}`),

  clearHistory: () =>
    request('/history', { method: 'DELETE' }),

  triggerFetch: () => request('/fetch', { method: 'POST' }),

  testTelegram: () => request('/test-telegram', { method: 'POST' }),

  toggleSource: (id, active) =>
    request(`/sources/${id}/toggle?active=${active}`, { method: 'PATCH' }),

  downloadBackup: () => fetch('/api/backup').then(r => r.blob()),
  downloadFullBackup: () => fetch('/api/backup/db').then(r => r.blob()),

  restoreBackup: (data) =>
    request('/restore', { method: 'POST', body: JSON.stringify(data) }),

  restoreFullDb: (file) => {
    const form = new FormData()
    form.append('file', file)
    return fetch('/api/restore/db', { method: 'POST', body: form })
      .then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ detail: r.statusText }))
          throw new Error(err.detail || 'Restore failed')
        }
        return r.json()
      })
  },

  // Mark all seen (with optional filters)
  markAllSeen: ({ topic, source, search, sinceDays } = {}) => {
    const p = new URLSearchParams()
    if (topic && topic !== 'All') p.set('topic', topic)
    if (source && source !== 'All') p.set('source', source)
    if (search) p.set('search', search)
    if (sinceDays) p.set('since_days', sinceDays)
    return request(`/articles/mark-all-seen?${p}`, { method: 'POST' })
  },

  // Article in-app reader
  getArticleContent: (id) => request(`/articles/${id}/content`),

  // Source management
  addSource: (data) =>
    request('/sources', { method: 'POST', body: JSON.stringify(data) }),
  deleteSource: (id) =>
    request(`/sources/${id}`, { method: 'DELETE' }),

  // Analytics
  getReadingStats: () => request('/stats/reading'),
  getTrending: (hours = 24) => request(`/trending?hours=${hours}`),

  // Digest
  sendDigest: () => request('/digest', { method: 'POST' }),
}
