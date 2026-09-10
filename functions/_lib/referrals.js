// Referrer tallying for the free prize drawing.
//
// Recognition only. Nothing in this file affects anyone's odds - it exists so
// we can read a name out loud at the sale. referred_by is free text a stranger
// typed; it is never matched to a client, resident or staff record.
//
// Grouped case-insensitively and with periods/whitespace flattened, so
// " Sarah M. ", "sarah m." and "Sarah M" are one person, not three.

export function referrerKey(raw) {
  return String(raw == null ? '' : raw).trim().toLowerCase().replace(/[.\s]+/g, ' ').trim();
}

export function countReferred(entries) {
  return (entries || []).filter(e => String(e.referred_by || '').trim()).length;
}

export function tallyReferrers(entries, limit = 5) {
  const tally = new Map();
  for (const e of entries || []) {
    const raw = String(e.referred_by || '').trim();
    if (!raw) continue;
    const key = referrerKey(raw);
    if (!key) continue;
    const hit = tally.get(key);
    if (hit) hit.count++; else tally.set(key, { name: raw, count: 1 });
  }
  return [...tally.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
