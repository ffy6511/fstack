export function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}
export function timingOf(value = {}) {
  value = value || {};
  const phase = value.phase_timing || {};
  const startedAt = timestamp(value.started_at || value.started || phase.started_at);
  const finishedAt = timestamp(value.finished_at || value.finished || phase.finished_at);
  const raw = value.duration_ms ?? phase.total_ms;
  const durationMs = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw
    : startedAt && finishedAt && Date.parse(finishedAt) >= Date.parse(startedAt) ? Date.parse(finishedAt) - Date.parse(startedAt) : null;
  return { startedAt, finishedAt, durationMs };
}
export function sortSuites(rows, order = 'time-desc') {
  const descending = order.endsWith('-desc');
  const value = row => order.startsWith('rate-') ? (typeof row.passRate === 'number' && Number.isFinite(row.passRate) ? row.passRate : null)
    : order.startsWith('time-') ? (timestamp(row.createdAt) ? Date.parse(row.createdAt) : null) : row.suite;
  return [...rows].sort((a, b) => {
    const x = value(a), y = value(b);
    if (x == null && y != null) return 1;
    if (y == null && x != null) return -1;
    const comparison = x == null ? 0 : typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
    return (descending ? -comparison : comparison) || `${a.dataset}/${a.suite}`.localeCompare(`${b.dataset}/${b.suite}`);
  });
}
export function formatTimestamp(value) {
  const valid = timestamp(value);
  return valid ? new Date(valid).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '时间未记录';
}
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '耗时未记录';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + ' 秒';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' 分 ' + seconds % 60 + ' 秒';
  return Math.floor(seconds / 3600) + ' 小时 ' + Math.floor(seconds % 3600 / 60) + ' 分';
}
