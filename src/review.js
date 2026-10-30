// Monthly and quarterly reviews: statistics over a period, compared with the period before.
// Everything is computed on the device from the day, week and month documents.

import { html } from './ui.js';
import { store } from './db.js';
import { VIRTUES, IMMEASURABLES, BODY_LEVELS, themeFor, hasStoic, hasBuddhist } from './stoic.js';
import { MONTHS, ymd, ym, addDays } from './dates.js';
import { buildStory, StoryCard } from './story.js';

export function hasContent(doc) {
  return Object.values(doc || {}).some((v) => (typeof v === 'string' ? v.trim()
    : Array.isArray(v) ? v.some((x) => (typeof x === 'string' ? x.trim() : x && Object.values(x).some(Boolean)))
    : v && typeof v === 'object' ? Object.values(v).some((x) => (Array.isArray(x) ? x.some(Boolean) : !!x)) : !!v));
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const fmt = (x) => (x == null ? '–' : x.toFixed(1));

function daysBetween(from, to) {
  const out = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Statistics for [from, to).
export function periodStats(from, to, settings) {
  const days = daysBetween(from, to);
  const habits = settings.habits || [];
  const bodyItems = settings.body || [];
  const s = {
    from, to, days: days.length, journaled: 0, calm: 0, allVirtues: 0,
    mood: [], energy: [], perDay: [],
    virtues: Object.fromEntries(VIRTUES.map((v) => [v.id, 0])),
    imm: Object.fromEntries(IMMEASURABLES.map((v) => [v.id, 0])), allImm: 0,
    sitDays: 0, sitMin: 0, arrow: [],
    habits: Object.fromEntries(habits.map((h) => [h.id, 0])),
    body: Object.fromEntries(bodyItems.map((b) => [b.id, { sum: 0, n: 0, heavy: 0, perDay: [] }])),
    extras: {}, gratitude: {}, wins: [],
    intTotal: 0, intDone: 0, intMoved: 0, intOpen: 0,
  };
  for (const d of days) {
    const doc = store.get(`day:${ymd(d)}`) || {};
    const journaled = hasContent(doc);
    if (journaled) s.journaled++;
    if (doc.mood) { s.mood.push(doc.mood); if (doc.mood >= 4) s.calm++; }
    // Intentions: slot 0 is the main one, then the extra lines.
    [doc.intention, ...(doc.intentions || [])].forEach((t, slot) => {
      if (!(t || '').trim()) return;
      s.intTotal++;
      if (doc.idone?.[slot]) s.intDone++;
      else if (doc.imoved?.[slot]) s.intMoved++;
      else s.intOpen++;
    });
    if (doc.energy) s.energy.push(doc.energy);
    const v = doc.virtues || {};
    for (const x of VIRTUES) if (v[x.id]) s.virtues[x.id]++;
    if (VIRTUES.every((x) => v[x.id])) s.allVirtues++;
    const im = doc.immeasurables || {};
    for (const x of IMMEASURABLES) if (im[x.id]) s.imm[x.id]++;
    if (IMMEASURABLES.every((x) => im[x.id])) s.allImm++;
    if (doc.sit?.done || doc.sit?.min > 0) { s.sitDays++; s.sitMin += doc.sit?.min || 0; }
    if (doc.arrow) s.arrow.push(doc.arrow);
    for (const h of habits) if (doc.habits?.[h.id]) s.habits[h.id]++;
    // A day counts for body averages once anything about the body was entered that day.
    const body = doc.body || {};
    const extras = (doc.bodyExtra || []).filter((x) => x.text?.trim());
    const bodyDay = Object.values(body).some((x) => x > 0) || extras.length > 0 || !!doc.bodyOk;
    for (const b of bodyItems) {
      const lvl = body[b.id] || 0;
      s.body[b.id].perDay.push(bodyDay ? lvl : null);
      if (bodyDay) { s.body[b.id].sum += lvl; s.body[b.id].n++; if (lvl >= 2) s.body[b.id].heavy++; }
    }
    for (const x of extras) {
      const k = x.text.trim().toLowerCase();
      const e = s.extras[k] || (s.extras[k] = { label: x.text.trim(), days: 0, perDay: new Map() });
      e.days++;
      e.perDay.set(ymd(d), x.level || 1);
    }
    for (const g of doc.gratitude || []) {
      const k = (g || '').trim().toLowerCase();
      if (k) s.gratitude[k] = (s.gratitude[k] || 0) + 1;
    }
    s.perDay.push({ date: d, doc, mood: doc.mood || null, energy: doc.energy || null });
  }
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const m = store.get(`month:${ym(d)}`) || {};
    for (const w of m.wins || []) if (w && w.trim()) s.wins.push(w.trim());
  }
  s.intPct = s.intTotal ? Math.round((s.intDone / s.intTotal) * 100) : null;
  s.arrowAvg = r1(avg(s.arrow));
  s.moodAvg = r1(avg(s.mood));
  s.energyAvg = r1(avg(s.energy));
  for (const b of bodyItems) s.body[b.id].avg = s.body[b.id].n ? r1(s.body[b.id].sum / s.body[b.id].n) : null;
  return s;
}

// Simple "on days with X, mood averaged Y" comparisons. Co-occurrence only, no causes.
export function patterns(s, settings) {
  const out = [];
  const moodWith = (pred) => {
    const yes = []; const no = [];
    for (const p of s.perDay) if (p.mood) (pred(p.doc) ? yes : no).push(p.mood);
    return { yes, no };
  };
  for (const h of settings.habits || []) {
    const { yes, no } = moodWith((doc) => doc.habits?.[h.id]);
    if (yes.length >= 4 && no.length >= 4) {
      const a = avg(yes); const b = avg(no);
      if (Math.abs(a - b) >= 0.4) out.push({ w: Math.abs(a - b), text: `On days you ticked “${h.name}”, mood averaged ${fmt(a)}; on other days, ${fmt(b)}.` });
    }
  }
  if (hasBuddhist(settings.path)) {
    const { yes, no } = moodWith((doc) => doc.sit?.done || doc.sit?.min > 0);
    if (yes.length >= 4 && no.length >= 4) {
      const a = avg(yes); const b = avg(no);
      if (Math.abs(a - b) >= 0.4) out.push({ w: Math.abs(a - b), text: `On days you sat, mood averaged ${fmt(a)}; on other days, ${fmt(b)}.` });
    }
  }
  for (const b of settings.body || []) {
    const { yes, no } = moodWith((doc) => (doc.body?.[b.id] || 0) >= 2);
    if (yes.length >= 3 && no.length >= 3) {
      const x = avg(yes); const y = avg(no);
      if (Math.abs(x - y) >= 0.4) out.push({ w: Math.abs(x - y), text: `When ${b.name.toLowerCase()} bothered you clearly or a lot, mood averaged ${fmt(x)}; otherwise ${fmt(y)}.` });
    }
  }
  // The heaviest week: lowest 7-day mood average, if clearly below the period average.
  const moods = s.perDay.map((p) => p.mood);
  let worst = null;
  for (let i = 0; i + 7 <= moods.length; i++) {
    const win = moods.slice(i, i + 7).filter(Boolean);
    if (win.length >= 4) { const a = avg(win); if (!worst || a < worst.a) worst = { a, i }; }
  }
  if (worst && s.moodAvg && s.moodAvg - worst.a >= 0.6) {
    const a = s.perDay[worst.i].date; const b = s.perDay[worst.i + 6].date;
    out.push({ w: s.moodAvg - worst.a, text: `Your heaviest stretch was ${MONTHS[a.getMonth()].slice(0, 3)} ${a.getDate()}–${MONTHS[b.getMonth()].slice(0, 3)} ${b.getDate()}, with mood averaging ${fmt(worst.a)}.` });
  }
  for (const e of Object.values(s.extras)) {
    if (e.days >= 2) out.push({ w: 0.3, text: `“${e.label}” came up on ${e.days} days.` });
  }
  return out.sort((a, b) => b.w - a.w).slice(0, 4).map((p) => p.text);
}

// ---------- comparison rows ----------

// higherIsBetter: true / false / null (neutral). Only used to word the change, never to judge.
function change(cur, prev, unit = '') {
  if (cur == null || prev == null) return html`<span class="delta">–</span>`;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return html`<span class="delta">same</span>`;
  return html`<span class="delta">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${unit}</span>`;
}

function compareRows(cur, prev, settings) {
  const rows = [
    { group: 'Overall', label: 'Days journaled', c: cur.journaled, p: prev.journaled },
    { label: 'Average mood (1–5)', c: cur.moodAvg, p: prev.moodAvg, dec: true },
    { label: 'Average energy (1–5)', c: cur.energyAvg, p: prev.energyAvg, dec: true },
    { label: 'Calm days (mood 4–5)', c: cur.calm, p: prev.calm },
    { group: 'Intentions', label: 'Done', c: cur.intDone, p: prev.intDone },
    { label: 'Moved to tomorrow', c: cur.intMoved, p: prev.intMoved },
    { label: 'Not done', c: cur.intOpen, p: prev.intOpen },
    { label: 'Share done (%)', c: cur.intPct, p: prev.intPct },
  ];
  if (hasStoic(settings.path)) rows.push(
    { group: 'Virtues (days)', label: 'All four virtues', c: cur.allVirtues, p: prev.allVirtues },
    ...VIRTUES.map((v) => ({ label: v.name, c: cur.virtues[v.id], p: prev.virtues[v.id] })),
  );
  if (hasBuddhist(settings.path)) rows.push(
    { group: 'Immeasurables (days)', label: 'All four immeasurables', c: cur.allImm, p: prev.allImm },
    ...IMMEASURABLES.map((v) => ({ label: v.name, c: cur.imm[v.id], p: prev.imm[v.id] })),
    { group: 'Practice', label: 'Days sat', c: cur.sitDays, p: prev.sitDays },
    { label: 'Minutes sat', c: cur.sitMin, p: prev.sitMin },
    { label: 'Struggle against discomfort (0–3)', c: cur.arrowAvg, p: prev.arrowAvg, dec: true },
  );
  (settings.body || []).forEach((b, i) => rows.push({
    group: i === 0 ? 'How my body felt (average 0–3)' : '', label: b.name, c: cur.body[b.id]?.avg ?? null, p: prev.body[b.id]?.avg ?? null, dec: true,
  }));
  (settings.habits || []).forEach((h, i) => rows.push({
    group: i === 0 ? 'Habits (days done)' : '', label: h.name, c: cur.habits[h.id] ?? 0, p: prev.habits[h.id] ?? 0,
  }));
  return rows;
}

const show = (x, dec) => (x == null ? '–' : dec ? x.toFixed(1) : x);

function CompareTable({ cur, prev, settings, curLabel, prevLabel, extraCols }) {
  const rows = compareRows(cur, prev, settings);
  return html`
    <div class="table-wrap">
      <table class="compare">
        <thead><tr><th></th>${extraCols ? extraCols.map((c) => html`<th>${c.label}</th>`) : ''}<th>${curLabel}</th><th>${prevLabel}</th><th>Change</th></tr></thead>
        <tbody>
          ${rows.map((r, idx) => html`
            ${r.group && html`<tr class="group"><th colspan=${4 + (extraCols?.length || 0)}>${r.group}</th></tr>`}
            <tr>
              <th>${r.label}</th>
              ${extraCols ? extraCols.map((c) => html`<td class="muted">${show(compareRows(c.stats, c.stats, settings)[idx].c, r.dec)}</td>`) : ''}
              <td><b>${show(r.c, r.dec)}</b></td>
              <td class="muted">${show(r.p, r.dec)}</td>
              <td>${change(r.c, r.p)}</td>
            </tr>`)}
        </tbody>
      </table>
    </div>`;
}

// ---------- small charts ----------

function MoodChart({ s, prev }) {
  const W = 600; const H = 150; const pad = 22;
  const n = s.perDay.length;
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, n - 1);
  const y = (v) => H - pad - ((v - 1) / 4) * (H - pad * 2);
  const line = (key) => {
    // Days without an entry are skipped, so the line connects the days you did fill in.
    let d = '';
    s.perDay.forEach((p, i) => {
      if (p[key]) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`;
    });
    return d;
  };
  return html`
    <svg class="mood-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mood and energy per day, with last period's average mood as a dotted line">
      ${[1, 2, 3, 4, 5].map((v) => html`<line x1=${pad} x2=${W - pad} y1=${y(v)} y2=${y(v)} class="grid" /><text x="4" y=${y(v) + 4} class="tick">${v}</text>`)}
      ${prev.moodAvg && html`<line x1=${pad} x2=${W - pad} y1=${y(prev.moodAvg)} y2=${y(prev.moodAvg)} class="prev" />`}
      <path d=${line('energy')} class="energy" />
      <path d=${line('mood')} class="mood" />
    </svg>
    <div class="chart-legend">
      <span><i class="sw mood"></i>Mood</span><span><i class="sw energy"></i>Energy</span>
      ${prev.moodAvg && html`<span><i class="sw prev"></i>Previous period's mood (${prev.moodAvg.toFixed(1)})</span>`}
    </div>`;
}

function BodyStrip({ s, settings }) {
  const rows = (settings.body || []).map((b) => ({ label: b.name, cells: s.body[b.id].perDay }));
  for (const e of Object.values(s.extras)) rows.push({ label: e.label, cells: s.perDay.map((p) => e.perDay.get(ymd(p.date)) || null) });
  if (!rows.some((r) => r.cells.some((c) => c))) return html`<p class="hint">Nothing recorded about your body in this period.</p>`;
  return html`
    <div class="body-strip">
      ${rows.map((r) => html`<div class="bs-row"><span class="bs-label">${r.label}</span>
        ${r.cells.map((c, i) => html`<i class=${`l${c || 0} ${c == null ? 'none' : ''}`} title=${`${ymd(s.perDay[i].date)}: ${c ? BODY_LEVELS[c] : c === 0 ? 'none' : 'not filled in'}`}></i>`)}
      </div>`)}
      <div class="bs-legend"><span><i class="l1"></i>a little</span><span><i class="l2"></i>clearly</span><span><i class="l3"></i>a lot</span></div>
    </div>`;
}

function Tiles({ cur, prev, settings }) {
  const tile = (label, c, p, dec) => html`<div class="tile"><small>${label}</small><b>${show(c, dec)}</b>${change(c, p)}</div>`;
  return html`<div class="tiles">
    ${tile('Average mood', cur.moodAvg, prev.moodAvg, true)}
    ${tile('Average energy', cur.energyAvg, prev.energyAvg, true)}
    ${tile('Intentions done (%)', cur.intPct, prev.intPct)}
    ${settings.path === 'buddhist'
      ? tile('Days with all four immeasurables', cur.allImm, prev.allImm)
      : tile('Days with all four virtues', cur.allVirtues, prev.allVirtues)}
    ${hasBuddhist(settings.path) ? tile('Days sat', cur.sitDays, prev.sitDays) : ''}
    ${tile('Calm days (mood 4–5)', cur.calm, prev.calm)}
  </div>`;
}

function OwnWords({ s }) {
  const top = Object.entries(s.gratitude).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!top.length && !s.wins.length) return '';
  return html`<h3 class="review-h">From your own words</h3>
    <div class="own-words">
      ${top.length > 0 && html`<p>Most frequent gratitude: ${top.map(([k], i) => html`${i ? ', ' : ''}“${k}”`)}.</p>`}
      ${s.wins.slice(0, 3).map((w) => html`<p>A win you wrote down: “${w}”</p>`)}
    </div>`;
}

const enough = (s) => s.journaled >= 5;

// ---------- monthly ----------

export function MonthReview({ y, m, settings }) {
  const from = new Date(y, m, 1); const to = new Date(y, m + 1, 1);
  const pFrom = new Date(y, m - 1, 1);
  const cur = periodStats(from, to, settings);
  const prev = periodStats(pFrom, from, settings);
  const prevName = MONTHS[pFrom.getMonth()];
  if (!enough(cur)) {
    return html`<section class="review"><h2 class="phase">Review of ${MONTHS[m]}</h2>
      <p class="hint">The review appears once at least 5 days are filled in (${cur.journaled} so far).</p></section>`;
  }
  const pats = patterns(cur, settings);
  return html`
    <section class="review">
      <h2 class="phase">Review of ${MONTHS[m]} <small>compared with ${prevName}</small></h2>
      <p class="hint">${cur.journaled} of ${cur.days} days journaled · Theme: ${(store.get(`month:${ym(from)}`) || {}).theme || themeFor(m, settings.path).title}</p>
      <${StoryCard} story=${buildStory({ from, to, prevFrom: pFrom, label: `${MONTHS[m]} ${y}`, prevLabel: prevName, kind: 'month', settings })} />
      <${Tiles} cur=${cur} prev=${prev} settings=${settings} />
      <h3 class="review-h">Mood and energy per day</h3>
      <${MoodChart} s=${cur} prev=${prev} />
      <h3 class="review-h">How my body felt</h3>
      <${BodyStrip} s=${cur} settings=${settings} />
      <h3 class="review-h">Compared with ${prevName}</h3>
      ${!enough(prev) && html`<p class="hint">${prevName} has only ${prev.journaled} days filled in, so the comparison is rough.</p>`}
      <${CompareTable} cur=${cur} prev=${prev} settings=${settings} curLabel=${MONTHS[m].slice(0, 3)} prevLabel=${prevName.slice(0, 3)} />
      ${pats.length > 0 && html`<h3 class="review-h">Patterns noticed</h3>
        <ul class="patterns">${pats.map((p) => html`<li>${p}</li>`)}</ul>
        <p class="hint small">These show what happened together, not what caused what.</p>`}
      <${OwnWords} s=${cur} />
      <h3 class="review-h">Reflect on this month</h3>
      <ul class="patterns reflect">
        <li>What was up to me this month, and did I give it my best?</li>
        <li>Compared with ${prevName}, what changed in how I met difficulty?</li>
      </ul>
    </section>`;
}

// ---------- quarterly ----------

export const quarterOf = (d) => Math.floor(d.getMonth() / 3) + 1;

export function QuarterReview({ y, q, settings }) {
  const from = new Date(y, (q - 1) * 3, 1); const to = new Date(y, q * 3, 1);
  const pFrom = new Date(y, (q - 2) * 3, 1);
  const pq = q === 1 ? 4 : q - 1; const py = q === 1 ? y - 1 : y;
  const cur = periodStats(from, to, settings);
  const prev = periodStats(pFrom, from, settings);
  const months = [0, 1, 2].map((i) => {
    const a = new Date(y, (q - 1) * 3 + i, 1);
    return { label: MONTHS[a.getMonth()].slice(0, 3), stats: periodStats(a, new Date(y, (q - 1) * 3 + i + 1, 1), settings), m: a.getMonth() };
  });
  if (!enough(cur)) {
    return html`<section class="review"><p class="hint">The review appears once at least 5 days in Q${q} are filled in (${cur.journaled} so far).</p></section>`;
  }
  const trend = (key, label) => {
    const vals = months.map((x) => x.stats[key]).filter((v) => v != null);
    return vals.length >= 2 ? `${label}: ${vals.map((v) => v.toFixed(1)).join(' → ')}.` : null;
  };
  const best = (settings.habits || []).map((h) => ({ h, n: cur.habits[h.id] })).sort((a, b) => b.n - a.n)[0];
  const themes = months.map((x) => (store.get(`month:${y}-${String(x.m + 1).padStart(2, '0')}`) || {}).theme || themeFor(x.m, settings.path).title);
  const lines = [
    trend('moodAvg', 'Mood per month'),
    trend('energyAvg', 'Energy per month'),
    best && best.n > 0 ? `Most consistent habit: ${best.h.name} (${best.n} of ${cur.days} days).` : null,
    `Your themes this quarter: ${themes.join(', ')}.`,
  ].filter(Boolean);
  const pats = patterns(cur, settings);
  return html`
    <section class="review">
      <h2 class="phase">Q${q} ${y} <small>compared with Q${pq} ${py}</small></h2>
      <p class="hint">${cur.journaled} of ${cur.days} days journaled</p>
      <${StoryCard} story=${buildStory({ from, to, prevFrom: pFrom, label: `Q${q} ${y}`, prevLabel: `Q${pq} ${py}`, kind: 'quarter', settings, months: months.map((x) => x.stats).filter((x) => x.moodAvg != null) })} />
      <${Tiles} cur=${cur} prev=${prev} settings=${settings} />
      <ul class="patterns">${lines.map((l) => html`<li>${l}</li>`)}</ul>
      <h3 class="review-h">Month by month, and compared with Q${pq}</h3>
      ${!enough(prev) && html`<p class="hint">Q${pq} has only ${prev.journaled} days filled in, so the comparison is rough.</p>`}
      <${CompareTable} cur=${cur} prev=${prev} settings=${settings} curLabel=${`Q${q}`} prevLabel=${`Q${pq}`} extraCols=${months} />
      ${pats.length > 0 && html`<h3 class="review-h">Patterns noticed</h3>
        <ul class="patterns">${pats.map((p) => html`<li>${p}</li>`)}</ul>
        <p class="hint small">These show what happened together, not what caused what.</p>`}
      <${OwnWords} s=${cur} />
      <h3 class="review-h">Reflect on this quarter</h3>
      <ul class="patterns reflect">
        <li>Who was I becoming these three months?</li>
        <li>What will I carry into next quarter, and what will I set down?</li>
      </ul>
    </section>`;
}
