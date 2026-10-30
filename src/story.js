// Written reviews ("story") for a month, quarter or year, generated on the device.
// Built only from rules and your own entries: nothing is sent anywhere.

import { html, useState } from './ui.js';
import { store } from './db.js';
import { VIRTUES, IMMEASURABLES, hasStoic, hasBuddhist } from './stoic.js';
import { MONTHS } from './dates.js';
import { periodStats } from './review.js';

const T = (x) => (typeof x === 'string' ? x.trim() : '');
const fmt = (x) => (x == null ? '–' : x.toFixed(1));
const short = (d) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const STOP = new Set(`the and for with that this have has had was were are been being from into onto about over under after before than then them they their there here what when where which while who whom whose why how not but just very more most less much many some any all each every other another such fact only also even still again once both few own same into out off too can could would should will shall might must may did does doing done get got make made take took give gave let lets going went come came know think thing things really today tomorrow yesterday time times day days week weeks month year good great nice well able being myself yourself himself herself itself ourselves your yours mine ours his hers its our lot lots little bit way ways back like feel felt want need needs needed try trying keep kept start started stop work working there's it's i'm i've don't didn't can't won't doesn't isn't wasn't aren't een het van voor met niet maar ook dan dat die wel nog naar bij als maar zijn haar hun mijn wat waar hoe heb hebben gedaan`.split(/\s+/));

// Words that came back on at least `min` different days in the given fields.
function recurring(perDay, pick, min = 2, max = 4) {
  const days = new Map();
  for (const p of perDay) {
    const text = pick(p.doc).join(' ').toLowerCase();
    const words = new Set(text.split(/[^a-zà-ÿ'’]+/).map((w) => w.replace(/['’]s$/, '')).filter((w) => w.length >= 4 && !STOP.has(w) && !w.endsWith('ing')));
    for (const w of words) {
      if (!days.has(w)) days.set(w, []);
      days.get(w).push(p);
    }
  }
  return [...days.entries()].filter(([, ds]) => ds.length >= min)
    .sort((a, b) => b[1].length - a[1].length).slice(0, max)
    .map(([word, ds]) => ({ word, days: ds }));
}

const struggleFields = (d) => [T(d.cling), T(d.review?.short), T(d.review?.better), ...(d.iwhy || []).map(T),
  ...(d.premed || []).map((x) => T(x?.risk)), ...(d.bodyExtra || []).map((x) => T(x?.text)), ...(d.letbe || []).map(T),
  ...(d.control?.in || []).map(T)];
const gratitudeFields = (d) => (d.gratitude || []).map(T);
const HEAVY = /\b(pain|hurt|difficult|afraid|fear|scared|sad|grief|griev|worr|miss(ed|ing)?|lonely|death|dying|die|days left|time left|worst|loss|cry|guilt)/i;

function intentionTrail(perDay) {
  const byText = new Map();
  for (const p of perDay) {
    const d = p.doc;
    [d.intention, ...(d.intentions || [])].forEach((t, slot) => {
      const text = T(t);
      if (!text) return;
      const k = text.toLowerCase();
      const e = byText.get(k) || { text, moved: 0, done: null, open: null };
      if (d.imoved?.[slot]) e.moved++;
      else if (d.idone?.[slot]) e.done = p.date;
      else e.open = p.date;
      byText.set(k, e);
    });
  }
  return [...byText.values()];
}

// ---------- the text ----------

export function buildStory({ from, to, prevFrom, label, prevLabel, kind, settings, months }) {
  const s = periodStats(from, to, settings);
  const prev = periodStats(prevFrom, from, settings);
  const days = s.perDay.filter((p) => Object.keys(p.doc).length);
  const path = settings.path || 'stoic';
  const sections = [];
  const add = (title, paras) => { const ps = paras.filter(Boolean); if (ps.length) sections.push({ title, paras: ps }); };
  const year = store.get(`year:${from.getFullYear()}`) || {};

  // Who you were
  const metta = new Map();
  for (const p of days) {
    const name = T(p.doc.metta).split(/[\s,;:(]+/)[0];
    if (name && name.length > 1) metta.set(cap(name.toLowerCase()), (metta.get(cap(name.toLowerCase())) || 0) + 1);
  }
  const topMetta = [...metta.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const gratWords = recurring(days, gratitudeFields, 2, 4);
  const gratLines = days.flatMap((p) => gratitudeFields(p.doc).filter(Boolean).map((g) => [g, short(p.date)]));
  add('Who you were', [
    T(year.become) && `This year you wrote that you want to be: “${T(year.become)}”. Read this ${kind} with that in mind.`,
    gratWords.length && `In your gratitude, these came back most: ${list(gratWords.map((g) => `${cap(g.word)} (${plural(g.days.length, 'day')})`))}.`,
    topMetta.length && `The people you wished well most often: ${list(topMetta.map(([n, c]) => `${n} (${c}×)`))}.`,
    gratLines.length >= 3 && { quotes: [gratLines[0], gratLines[Math.floor(gratLines.length / 2)], gratLines[gratLines.length - 1]] },
  ]);

  // How you felt
  const moods = days.filter((p) => p.mood);
  const dist = [5, 4, 3, 2, 1].map((v) => [v, moods.filter((p) => p.mood === v).length]).filter(([, n]) => n);
  const lowest = moods.length ? Math.min(...moods.map((p) => p.mood)) : null;
  const lowDays = moods.filter((p) => p.mood === lowest && lowest < (s.moodAvg ?? 0));
  const lowWhy = lowDays.map((p) => ({ p, why: T(p.doc.cling) || T(p.doc.review?.short) || (p.doc.premed || []).map((x) => T(x?.risk)).find(Boolean) || T(p.doc.notes).split(/\n/)[0] }));
  add('How you felt', [
    s.moodAvg != null && `Mood averaged ${fmt(s.moodAvg)} out of 5 (${list(dist.map(([v, n]) => `${plural(n, 'day')} at ${v}`))}). Energy averaged ${fmt(s.energyAvg)}.`,
    prev.moodAvg != null && s.moodAvg != null && `Compared with ${prevLabel}, mood went ${s.moodAvg > prev.moodAvg ? 'up' : s.moodAvg < prev.moodAvg ? 'down' : 'nowhere'} (${fmt(prev.moodAvg)} → ${fmt(s.moodAvg)}) and energy ${s.energyAvg > prev.energyAvg ? 'up' : s.energyAvg < prev.energyAvg ? 'down' : 'stayed the same'} (${fmt(prev.energyAvg)} → ${fmt(s.energyAvg)}).`,
    months && months.length > 1 && `Month by month, mood went ${months.map((m) => fmt(m.moodAvg)).join(' → ')}.`,
    lowWhy.length > 0 && lowWhy.length <= 3 && `Your lowest ${lowWhy.length === 1 ? 'day was' : 'days were'} ${list(lowWhy.map((x) => short(x.p.date)))}.${lowWhy.filter((x) => x.why).map((x) => ` On ${short(x.p.date)} you wrote: “${x.why}”`).join('')}`,
  ]);

  // Your body
  const rated = (settings.body || []).map((b) => ({ b, st: s.body[b.id] })).filter((x) => x.st && x.st.perDay.some((v) => v > 0));
  const bodyDays = days.filter((p) => Object.values(p.doc.body || {}).some((v) => v > 0) || (p.doc.bodyExtra || []).some((x) => T(x?.text)));
  const fineDays = days.filter((p) => p.doc.bodyOk && !bodyDays.includes(p));
  const emptyDays = days.length - bodyDays.length - fineDays.length;
  const extras = Object.values(s.extras);
  add('Your body', [
    rated.length ? `You noted: ${list(rated.map(({ b, st }) => `${b.name.toLowerCase()} on ${plural(st.perDay.filter((v) => v > 0).length, 'day')}${st.heavy ? ` (${st.heavy} clearly or a lot)` : ''}`))}.` : null,
    extras.length ? `In your own words: ${list(extras.map((e) => `“${e.label}”${e.days > 1 ? ` (${e.days} days)` : ''}`))}.` : null,
    s.arrowAvg != null && hasBuddhist(path) && `How much you struggled against it averaged ${fmt(s.arrowAvg)} of 3.`,
    fineDays.length ? `You marked ${plural(fineDays.length, 'day')} as all fine.` : null,
    emptyDays > 0 && `On ${emptyDays} of ${days.length} days this was left empty${fineDays.length ? '' : ', so the review can’t tell a good day from a skipped one'}.`,
  ]);

  // What you set out to do
  const trail = intentionTrail(days);
  const travelers = trail.filter((t) => t.moved >= 2).sort((a, b) => b.moved - a.moved).slice(0, 3);
  const whys = days.flatMap((p) => (p.doc.iwhy || []).map(T).filter(Boolean).map((w) => ({ p, w })));
  add('What you set out to do', [
    s.intTotal > 0 && `You set ${s.intTotal} intentions: ${s.intDone} done (${s.intPct}%), ${s.intMoved} moved to the next day, ${s.intOpen} not done.${prev.intPct != null ? ` In ${prevLabel} you finished ${prev.intPct}%.` : ''}`,
    travelers.length > 0 && `These kept moving: ${list(travelers.map((t) => `“${t.text}” (moved ${t.moved}×${t.done ? `, done on ${short(t.done)}` : t.open ? ', still open' : ''})`))}.`,
    whys.length > 0 && `When something didn’t happen, you wrote why: ${list(whys.slice(-3).map((x) => `“${x.w}” (${short(x.p.date)})`))}.`,
  ]);

  // Where you struggled
  const themes = recurring(days, struggleFields, 2, 4);
  add('Where you struggled', [
    themes.length > 0 && `These came up most in what you clung to, fell short on, or worried about: ${list(themes.map((t) => `${cap(t.word)} (${plural(t.days.length, 'day')})`))}.`,
    ...themes.map((t) => {
      const last = t.days[t.days.length - 1];
      const line = struggleFields(last.doc).find((x) => x.toLowerCase().includes(t.word));
      return line && `${cap(t.word)}, most recently on ${short(last.date)}: “${line}”`;
    }),
  ]);

  // Where you held steady
  const vset = [];
  if (hasStoic(path)) vset.push({ items: VIRTUES, counts: s.virtues, name: 'virtues' });
  if (hasBuddhist(path)) vset.push({ items: IMMEASURABLES, counts: s.imm, name: 'immeasurables' });
  const habits = (settings.habits || []).map((h) => [h.name, s.habits[h.id] || 0]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const wells = days.map((p) => ({ p, w: T(p.doc.review?.well) })).filter((x) => x.w);
  add('Where you held steady', [
    ...vset.map((v) => {
      const sorted = v.items.map((x) => [x.name, v.counts[x.id] || 0]).sort((a, b) => b[1] - a[1]);
      return `Of the ${v.name}, ${sorted[0][0]} came up most (${plural(sorted[0][1], 'day')}) and ${sorted[sorted.length - 1][0]} least (${sorted[sorted.length - 1][1]}).`;
    }),
    habits.length > 0 && `Habits: ${list(habits.map(([n, c]) => `${n.toLowerCase()} on ${plural(c, 'day')}`))}.`,
    s.sitDays > 0 && `You sat on ${plural(s.sitDays, 'day')}, ${s.sitMin} minutes in total.`,
    wells.length > 0 && { quotes: wells.slice(-3).map((x) => [x.w, short(x.p.date)]), lead: 'What you said you did well:' },
  ]);

  // What you carried
  const heavy = days.flatMap((p) => [T(p.doc.reflection), T(p.doc.cling), ...(p.doc.control?.out || []).map(T)]
    .filter((t) => t && HEAVY.test(t)).map((t) => [t, short(p.date)])).slice(0, 4);
  add('What you carried', [heavy.length > 0 && { quotes: heavy }]);

  // In your own words
  const refl = days.map((p) => ({ p, r: T(p.doc.reflection) })).filter((x) => x.r && !HEAVY.test(x.r)).sort((a, b) => a.r.length - b.r.length).slice(0, 2);
  add('In your own words', [refl.length > 0 && { quotes: refl.map((x) => [x.r, short(x.p.date)]) }]);

  // Held against your year page (yearly only)
  if (kind === 'year') {
    const clingDays = days.filter((p) => T(p.doc.cling) && !/^nothing/i.test(T(p.doc.cling))).length;
    add('Held against your year page', [
      (year.values || []).some(T) && `Your values: ${list((year.values || []).map(T).filter(Boolean).map((v) => `“${v.replace(/[.\s]+$/, '')}”`))}.`,
      (year.letgo || []).some(T) && `You wanted to let go of: “${(year.letgo || []).map(T).filter(Boolean).join(' ')}”`,
      `You named something you clung to on ${plural(clingDays, 'day')}, and something you fell short on on ${plural(days.filter((p) => T(p.doc.review?.short)).length, 'day')}.`,
    ]);
  }

  // Questions to take along
  const qs = [];
  if (travelers.length) qs.push('The big intentions moved; the small ones got done. How can you make a big one fit into a single day?');
  if (themes[0]) qs.push(`${cap(themes[0].word)} came back ${themes[0].days.length} times. What is it asking of you?`);
  const weak = vset[0] && vset[0].items.map((x) => [x, vset[0].counts[x.id] || 0]).sort((a, b) => a[1] - b[1])[0];
  if (weak) qs.push(`${weak[0].name} came up least. When could you practice it next ${kind}?`);
  if (heavy.length) qs.push('Of what you carried, is there something you want to act on, rather than only carry?');
  add(`For next ${kind}`, [{ items: qs }]);

  return { label, journaled: s.journaled, days: s.days, sections, text: toText(label, s, sections) };
}

function toText(label, s, sections) {
  const lines = [`${label}`, `Based on ${s.journaled} of ${s.days} days.`, ''];
  for (const sec of sections) {
    lines.push(sec.title.toUpperCase());
    for (const p of sec.paras) {
      if (typeof p === 'string') lines.push(p);
      else if (p.quotes) { if (p.lead) lines.push(p.lead); p.quotes.forEach(([q, d]) => lines.push(`  “${q}”${d ? ` (${d})` : ''}`)); } else if (p.items) p.items.forEach((q) => lines.push(`- ${q}`));
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------- display ----------

export function StoryCard({ story }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(story.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  return html`
    <article class="story">
      <header class="story-head">
        <div><p class="kicker">Written review</p><h3>${story.label}</h3>
          <p class="hint">Based on ${story.journaled} of ${story.days} days · written on this device from your entries</p></div>
        <button class="link small" onClick=${copy}>${copied ? 'Copied' : 'Copy text'}</button>
      </header>
      ${story.sections.map((sec) => html`
        <section>
          <h4>${sec.title}</h4>
          ${sec.paras.map((p) => (typeof p === 'string' ? html`<p>${p}</p>`
            : p.quotes ? html`${p.lead && html`<p>${p.lead}</p>`}<div class="own-words">${p.quotes.map(([q, d]) => html`<p>“${q}”${d && html` <small class="muted">${d}</small>`}</p>`)}</div>`
            : html`<ul class="patterns reflect">${p.items.map((q) => html`<li>${q}</li>`)}</ul>`))}
        </section>`)}
    </article>`;
}
