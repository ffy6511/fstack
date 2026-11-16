import { EvidenceError, segment, redact } from './evidence.js';
export function timingRequests(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) throw new EvidenceError('Request 1–50 task timings');
  return items.map(item => ({ task: segment(item?.task), run: segment(item?.run) }));
}
export async function collectTimings(items, read) {
  const results = [];
  for (const item of items) {
    try { results.push({ taskId: item.task, runId: item.run, timing: await read(item) }); }
    catch (error) { results.push({ taskId: item.task, runId: item.run, error: redact(error.message).slice(0, 700) }); }
  }
  return { results };
}
