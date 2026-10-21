// Read-only calendar feeds (iCloud public calendar links, or any .ics URL).
// Browsers can't fetch iCloud feeds directly (no CORS), so when signed in we go
// through the Supabase "ics-proxy" edge function.

import { metaGet, metaSet, sync } from './db.js';

const ICAL_URL = 'https://cdn.jsdelivr.net/npm/ical.js@1.5.0/+esm';
let ICAL = null;
const parsed = new Map(); // feed id -> { masters: ICAL.Event[], feed }
const listeners = new Set();
const errors = new Map();
let version = 0;
const cache = new Map();

export const feedErrors = () => errors;
export const onEvents = (fn) => (listeners.add(fn), () => listeners.delete(fn));
function changed() {
  version++;
  cache.clear();
  listeners.forEach((fn) => fn());
}

async function fetchIcs(url) {
  const https = url.trim().replace(/^webcal:\/\//i, 'https://');
  if (sync.client && sync.userId) {
    const { data, error } = await sync.client.functions.invoke('ics-proxy', { body: { url: https } });
    if (error) throw error;
    return typeof data === 'string' ? data : await new Response(data).text();
  }
  const res = await fetch(https);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parse(text, feed) {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* already registered */ }
  }
  const masters = new Map();
  const exceptions = [];
  for (const v of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex);
  return { masters: [...masters.values()], feed };
}

export async function refreshFeeds(feeds = []) {
  const active = feeds.filter((f) => f.enabled !== false && f.url);
  for (const id of [...parsed.keys()]) if (!active.find((f) => f.id === id)) parsed.delete(id);
  if (!active.length) return changed();
  if (!ICAL) ICAL = (await import(ICAL_URL)).default;

  await Promise.all(active.map(async (feed) => {
    // Show the cached copy right away, then refresh from the network.
    const cached = await metaGet('ics:' + feed.id);
    if (cached && !parsed.has(feed.id)) {
      try { parsed.set(feed.id, parse(cached, feed)); changed(); } catch { /* ignore broken cache */ }
    }
    try {
      const text = await fetchIcs(feed.url);
      parsed.set(feed.id, parse(text, feed));
      errors.delete(feed.id);
      metaSet('ics:' + feed.id, text).catch(() => {});
    } catch (err) {
      console.warn('calendar feed failed', feed.name, err);
      errors.set(feed.id, sync.userId ? String(err.message || err) : 'Sign in to load calendar feeds');
      if (parsed.has(feed.id)) parsed.get(feed.id).feed = feed;
    }
  }));
  changed();
}

function occurrence(ev, start, end, feed, key) {
  const allDay = ev.startDate.isDate;
  return {
    id: `${feed.id}:${ev.uid}:${key}`,
    title: ev.summary || '(no title)',
    location: ev.location || '',
    start,
    end,
    allDay,
    color: feed.color || '#7fb8d8',
    calendar: feed.name,
  };
}

// All event occurrences overlapping [from, to).
export function eventsBetween(from, to) {
  const ck = `${version}:${from.getTime()}:${to.getTime()}`;
  if (cache.has(ck)) return cache.get(ck);
  const out = [];
  for (const { masters, feed } of parsed.values()) {
    for (const ev of masters) {
      if (!ev.isRecurring()) {
        const s = ev.startDate.toJSDate();
        const e = ev.endDate ? ev.endDate.toJSDate() : s;
        if (s < to && (e > from || +s === +e && s >= from)) out.push(occurrence(ev, s, e, feed, s.getTime()));
        continue;
      }
      const it = ev.iterator();
      let next;
      let guard = 0;
      while ((next = it.next()) && guard++ < 20000) {
        const s0 = next.toJSDate();
        if (s0 >= to) break;
        const det = ev.getOccurrenceDetails(next);
        const s = det.startDate.toJSDate();
        const e = det.endDate.toJSDate();
        if (s < to && e > from) out.push(occurrence(det.item, s, e, feed, s0.getTime()));
      }
    }
  }
  out.sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
  cache.set(ck, out);
  return out;
}

// Map of "YYYY-MM-DD" -> events for every day in [from, to).
export function eventsByDay(from, to) {
  const map = new Map();
  for (const ev of eventsBetween(from, to)) {
    let d = new Date(Math.max(ev.start, from));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const last = ev.end > ev.start ? new Date(ev.end - 1) : ev.start;
    while (d <= last && d < to) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  }
  return map;
}
