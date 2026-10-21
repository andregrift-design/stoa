import { html, useEffect, useReducer, useState } from './ui.js';
import { store } from './db.js';
import { eventsByDay, onEvents } from './calendar.js';
import { InkPad } from './ink.js';
import { hasContent, MonthReview, QuarterReview, quarterOf } from './review.js';
import { quoteFor, MONTH_THEMES, exerciseFor, VIRTUES, DEFAULT_HABITS, DEFAULT_BODY, BODY_LEVELS } from './stoic.js';
import {
  MONTHS, DAYS, ymd, ym, addDays, startOfWeek, monthWeeks, sameDay, today, weekLabel, weekNumber,
  daysInMonth, fmtTime, parseYmd,
} from './dates.js';

// ---------- hooks ----------

export function useDoc(key, defaults = {}) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => store.subscribe(key, force), [key]);
  const data = { ...defaults, ...(store.get(key) || {}) };
  const update = (fn) => {
    const next = structuredClone({ ...defaults, ...(store.get(key) || {}) });
    fn(next);
    store.set(key, next);
  };
  return [data, update];
}

// Re-render on any change (for pages that summarize many days).
function useAnyChange() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => store.subscribe('*', force), []);
}

export function useEvents(from, to) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => onEvents(force), []);
  return eventsByDay(from, to);
}

export function useSettings() {
  return useDoc('settings', { calendars: [], habits: DEFAULT_HABITS, body: DEFAULT_BODY, lifespan: 80 });
}

const dayDoc = (d) => store.get(`day:${ymd(d)}`) || {};
const DAY = { body: {}, bodyExtra: [], intentions: [], premed: [], control: { in: [], out: [] }, habits: {}, gratitude: [], virtues: {}, review: {} };

// ---------- small building blocks ----------

const Line = ({ value, onInput, placeholder = '', cls = '', label }) => html`
  <input class="line ${cls}" value=${value || ''} placeholder=${placeholder} aria-label=${label || placeholder}
    onInput=${(e) => onInput(e.target.value)} />`;

const Area = ({ value, onInput, placeholder = '', rows = 2, label }) => html`
  <textarea class="area" rows=${rows} value=${value || ''} placeholder=${placeholder} aria-label=${label || placeholder}
    onInput=${(e) => onInput(e.target.value)}></textarea>`;

function setAt(arr, i, v, len) {
  const a = Array.from({ length: Math.max(len, arr?.length || 0) }, (_, j) => (arr || [])[j] ?? '');
  a[i] = v;
  return a;
}

function Scale({ value, onChange, label, low, high }) {
  return html`
    <div class="scale" role="group" aria-label=${label}>
      <span class="scale-label">${label}</span>
      <div class="scale-dots">
        ${[1, 2, 3, 4, 5].map((n) => html`
          <button class="m${n} ${value === n ? 'on' : ''}" aria-pressed=${value === n} aria-label=${`${label} ${n} of 5`}
            onClick=${() => onChange(value === n ? 0 : n)}>${n}</button>`)}
      </div>
      <span class="scale-ends"><small>${low}</small><small>${high}</small></span>
    </div>`;
}

const VIRTUE_STATES = ['', 'partly', 'yes'];
function VirtueToggle({ v, value, onCycle }) {
  const state = value || 0;
  return html`
    <button class="virtue v${state}" onClick=${onCycle} title=${v.q}>
      <span class="virtue-mark" aria-hidden="true"></span>
      <span class="virtue-text"><b>${v.name}</b><small>${v.q}</small></span>
      <span class="virtue-state">${VIRTUE_STATES[state] || 'tap'}</span>
    </button>`;
}

function BodyLevel({ label, value, onChange }) {
  return html`
    <div class="body-row">
      <span class="body-name">${label}</span>
      <div class="body-levels" role="group" aria-label=${label}>
        ${[1, 2, 3].map((n) => html`
          <button class=${`b${n} ${value === n ? 'on' : ''}`} aria-pressed=${value === n} title=${BODY_LEVELS[n]}
            aria-label=${`${label}: ${BODY_LEVELS[n]}`} onClick=${() => onChange(value === n ? 0 : n)}>${n}</button>`)}
      </div>
    </div>`;
}

function BodyBlock({ doc, update, items }) {
  const extra = doc.bodyExtra || [];
  const rows = [...extra, { text: '', level: 0 }];
  const setExtra = (i, patch) => update((d) => {
    const list = [...(d.bodyExtra || [])];
    list[i] = { ...(list[i] || { text: '', level: 0 }), ...patch };
    d.bodyExtra = list.filter((x, j) => j === i || x.text.trim() || x.level);
  });
  return html`
    <${Block} title="How my body feels" hint="Tap how much it bothers me: 1 a little, 2 clearly, 3 a lot">
      ${items.map((it) => html`<${BodyLevel} label=${it.name} value=${doc.body[it.id] || 0}
        onChange=${(n) => update((d) => { d.body[it.id] = n; })} />`)}
      ${rows.map((x, i) => html`
        <div class="body-row">
          <input class="line body-free" value=${x.text} placeholder=${i === extra.length ? 'Something else…' : ''}
            aria-label="Something else I notice" onInput=${(e) => setExtra(i, { text: e.target.value })} />
          <div class="body-levels" role="group" aria-label=${x.text || 'Something else'}>
            ${[1, 2, 3].map((n) => html`
              <button class=${`b${n} ${x.level === n ? 'on' : ''}`} aria-pressed=${x.level === n} title=${BODY_LEVELS[n]}
                onClick=${() => setExtra(i, { level: x.level === n ? 0 : n })}>${n}</button>`)}
          </div>
        </div>`)}
    <//>`;
}

function EventChip({ ev, compact }) {
  const time = ev.allDay ? '' : fmtTime(ev.start);
  return html`<div class="ev ${ev.allDay ? 'allday' : ''}" style=${`--evc:${ev.color}`}
    title=${`${ev.title}${time ? ' · ' + time + '–' + fmtTime(ev.end) : ''}${ev.location ? ' · ' + ev.location : ''} (${ev.calendar})`}>
    ${!compact && time ? html`<b>${time}</b> ` : ''}${ev.title}
  </div>`;
}

function Block({ title, hint, children, cls = '' }) {
  return html`<section class="block ${cls}">
    <header class="block-head"><h3>${title}</h3>${hint && html`<small>${hint}</small>`}</header>
    ${children}
  </section>`;
}

function NotesBox({ docKey, label = 'Journal' }) {
  const [doc, update] = useDoc(docKey, {});
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('notesMode') || 'type'; } catch { return 'type'; }
  });
  const pick = (m) => {
    setMode(m);
    try { localStorage.setItem('notesMode', m); } catch { /* ignore */ }
  };
  const hasInk = (doc.ink || []).length > 0;
  const hasText = !!(doc.notes || '').trim();
  return html`
    <section class="notes block">
      <header class="notes-head">
        <h3>${label}</h3>
        <div class="seg small">
          <button class=${mode === 'type' ? 'on' : ''} onClick=${() => pick('type')}>Type${hasText && mode !== 'type' ? ' •' : ''}</button>
          <button class=${mode === 'write' ? 'on' : ''} onClick=${() => pick('write')}>Write${hasInk && mode !== 'write' ? ' •' : ''}</button>
        </div>
      </header>
      ${mode === 'type'
        ? html`<textarea class="notes-text" value=${doc.notes || ''} placeholder="Write freely…"
            onInput=${(e) => update((d) => { d.notes = e.target.value; })}></textarea>`
        : html`<${InkPad} strokes=${doc.ink || []} onChange=${(s) => update((d) => { d.ink = s; })} />`}
    </section>`;
}

function QuoteCard({ date, big }) {
  const q = quoteFor(date);
  return html`<figure class="quote ${big ? 'big' : ''}">
    <blockquote>${q.t}</blockquote>
    <figcaption>${q.a} · <i>${q.s}</i></figcaption>
  </figure>`;
}

// ---------- Day ----------

export function DayView({ date, go }) {
  const [settings] = useSettings();
  const key = `day:${ymd(date)}`;
  const [doc, update] = useDoc(key, DAY);
  const events = useEvents(date, addDays(date, 1)).get(ymd(date)) || [];
  const q = quoteFor(date);
  const isToday = sameDay(date, today());
  const hour = new Date().getHours();
  const phase = !isToday ? '' : hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening';
  const title = `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  const theme = MONTH_THEMES[date.getMonth()];
  const now = (p) => (phase === p ? html`<span class="now">now</span>` : '');

  return html`
    <div class="page day">
      <header class="page-head">
        <div>
          <p class="kicker">${date.getFullYear()} · Week ${weekLabel(date).week} · ${theme.title}</p>
          <h1 class="display">${title}</h1>
        </div>
        <div class="crumbs">
          <button class="link" onClick=${() => go('week', date)}>Week</button>
          <button class="link" onClick=${() => go('month', date)}>${MONTHS[date.getMonth()]}</button>
        </div>
      </header>
      <${QuoteCard} date=${date} big />

      <div class="day-grid">
        <div class="col">
          <h2 class="phase">Morning <small>Prepare</small>${now('morning')}</h2>
          <${Block} title="Today I will…">
            <${Line} value=${doc.intention} placeholder="My main intention" onInput=${(v) => update((d) => { d.intention = v; })} />
            ${[0, 1, 2].map((i) => html`<${Line} value=${doc.intentions[i]} placeholder=${i === 0 ? 'Also…' : ''} label="Intention"
              onInput=${(v) => update((d) => { d.intentions = setAt(d.intentions, i, v, 3); })} />`)}
          <//>
          <${Block} title="Premeditatio malorum" hint="What could go wrong, and how will I respond?">
            ${[0, 1].map((i) => {
              const it = doc.premed[i] || {};
              const set = (patch) => update((d) => { d.premed = setAt(d.premed, i, { ...(d.premed[i] || {}), ...patch }, 2); });
              return html`<div class="pair">
                <${Line} value=${it.risk} placeholder="It might happen that…" onInput=${(v) => set({ risk: v })} />
                <${Line} cls="response" value=${it.response} placeholder="Then I will…" onInput=${(v) => set({ response: v })} />
              </div>`;
            })}
          <//>
          <${Block} title="Dichotomy of control">
            <div class="control">
              ${[['in', 'Up to me'], ['out', 'Not up to me']].map(([k, label]) => html`
                <div class="control-col ${k}">
                  <h4>${label}</h4>
                  ${[0, 1, 2].map((i) => html`<${Line} value=${doc.control[k]?.[i]} label=${label}
                    onInput=${(v) => update((d) => { d.control[k] = setAt(d.control[k], i, v, 3); })} />`)}
                </div>`)}
            </div>
          <//>
        </div>

        <div class="col">
          <h2 class="phase">Through the day <small>Live</small>${now('day')}</h2>
          ${events.length > 0 && html`<${Block} title="Commitments">
            ${events.map((ev) => html`<${EventChip} ev=${ev} />`)}
          <//>`}
          <${Block} title="Habits">
            <div class="habits">
              ${(settings.habits || []).map((h) => html`
                <label class="habit ${doc.habits[h.id] ? 'on' : ''}">
                  <input type="checkbox" checked=${!!doc.habits[h.id]}
                    onChange=${(e) => update((d) => { d.habits[h.id] = e.target.checked; })} />
                  <span>${h.name}</span>
                </label>`)}
              ${!(settings.habits || []).length && html`<p class="hint">Add habits in Settings.</p>`}
            </div>
          <//>
          <${BodyBlock} doc=${doc} update=${update} items=${settings.body || DEFAULT_BODY} />
          <${Block} title="Mood & energy">
            <${Scale} label="Mood" low="heavy" high="serene" value=${doc.mood} onChange=${(n) => update((d) => { d.mood = n; })} />
            <${Scale} label="Energy" low="drained" high="vital" value=${doc.energy} onChange=${(n) => update((d) => { d.energy = n; })} />
          <//>
          <${Block} title="Gratitude" hint="Three things I'm grateful for">
            ${[0, 1, 2].map((i) => html`<${Line} value=${doc.gratitude[i]} placeholder=${`${i + 1}.`} label="Grateful for"
              onInput=${(v) => update((d) => { d.gratitude = setAt(d.gratitude, i, v, 3); })} />`)}
          <//>
        </div>

        <div class="col">
          <h2 class="phase">Evening <small>Review</small>${now('evening')}</h2>
          <${Block} title="The four virtues" hint="Tap: partly, yes">
            <div class="virtues">
              ${VIRTUES.map((v) => html`<${VirtueToggle} v=${v} value=${doc.virtues[v.id]}
                onCycle=${() => update((d) => { d.virtues[v.id] = ((d.virtues[v.id] || 0) + 1) % 3; })} />`)}
            </div>
          <//>
          <${Block} title="Seneca's review">
            <${Area} value=${doc.review.well} placeholder="What did I do well?" onInput=${(v) => update((d) => { d.review.well = v; })} />
            <${Area} value=${doc.review.short} placeholder="Where did I fall short?" onInput=${(v) => update((d) => { d.review.short = v; })} />
            <${Area} value=${doc.review.better} placeholder="What will I do better tomorrow?" onInput=${(v) => update((d) => { d.review.better = v; })} />
          <//>
          <${Block} title="Reflection" hint=${q.p}>
            <${Area} rows=${3} value=${doc.reflection} placeholder="On today's quote…" onInput=${(v) => update((d) => { d.reflection = v; })} />
          <//>
        </div>
      </div>
      <${NotesBox} docKey=${key} />
    </div>`;
}

// ---------- Week ----------

function DayCard({ day, go, habits, events }) {
  const [doc, update] = useDoc(`day:${ymd(day)}`, DAY);
  const t = sameDay(day, today());
  return html`
    <article class="daycard ${t ? 'today' : ''}">
      <button class="daycard-head" onClick=${() => go('day', day)}>
        <span>${DAYS[day.getDay()].slice(0, 3)}</span><b>${day.getDate()}</b>
      </button>
      <p class="daycard-int ${doc.intention ? '' : 'empty'}">${doc.intention || 'No intention yet'}</p>
      <div class="daycard-meta">
        <span class="pip m${doc.mood || 0}" title=${`Mood ${doc.mood || '–'}`}></span>
        <span class="pip m${doc.energy || 0}" title=${`Energy ${doc.energy || '–'}`}></span>
        <span class="vdots">${VIRTUES.map((v) => html`<i class=${`v${doc.virtues[v.id] || 0}`} title=${v.name}></i>`)}</span>
      </div>
      <div class="daycard-habits">
        ${habits.map((h) => html`<button class="tick ${doc.habits[h.id] ? 'on' : ''}" title=${h.name} aria-label=${h.name}
          aria-pressed=${!!doc.habits[h.id]} onClick=${() => update((d) => { d.habits[h.id] = !d.habits[h.id]; })}>${h.name[0]}</button>`)}
      </div>
      ${events.slice(0, 3).map((ev) => html`<${EventChip} ev=${ev} compact />`)}
      ${events.length > 3 && html`<div class="ev more">+${events.length - 3}</div>`}
    </article>`;
}

export function WeekView({ date, go }) {
  const [settings] = useSettings();
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const events = useEvents(start, addDays(start, 7));
  const { week, year } = weekLabel(start);
  const [doc, update] = useDoc(`week:${ymd(start)}`, { review: {} });
  const ex = exerciseFor(week);
  return html`
    <div class="page week">
      <header class="page-head">
        <div>
          <p class="kicker">${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[days[6].getMonth()]} ${days[6].getDate()}</p>
          <h1 class="display">Week ${week}, ${year}</h1>
        </div>
      </header>
      <div class="week-top">
        <div class="exercise">
          <p class="kicker">Practice this week</p>
          <h3>${ex.title}</h3>
          <p>${ex.text}</p>
        </div>
        <${Block} title="Focus this week">
          <${Line} value=${doc.focus} placeholder="One thing to embody this week" onInput=${(v) => update((d) => { d.focus = v; })} />
          <${Line} value=${doc.focus2} placeholder="One thing to let go of" onInput=${(v) => update((d) => { d.focus2 = v; })} />
        <//>
      </div>
      <div class="daycards">
        ${days.map((d) => html`<${DayCard} day=${d} go=${go} habits=${settings.habits || []} events=${events.get(ymd(d)) || []} />`)}
      </div>
      <h2 class="phase">Weekly review</h2>
      <div class="review-grid">
        ${[
          ['well', 'What went well?'],
          ['externals', 'Where did I let externals rule me?'],
          ['learned', 'What did I learn?'],
          ['next', 'What will I carry into next week?'],
        ].map(([k, label]) => html`<${Block} title=${label}>
          <${Area} rows=${3} value=${doc.review[k]} label=${label} onInput=${(v) => update((d) => { d.review[k] = v; })} />
        <//>`)}
      </div>
    </div>`;
}

// ---------- Month ----------

function HabitGrid({ y, m, habits, go }) {
  const n = daysInMonth(y, m);
  const days = Array.from({ length: n }, (_, i) => new Date(y, m, i + 1));
  const t = today();
  const toggle = (d, id) => {
    const doc = structuredClone(dayDoc(d));
    doc.habits = { ...(doc.habits || {}), [id]: !doc.habits?.[id] };
    store.set(`day:${ymd(d)}`, doc);
  };
  if (!habits.length) return '';
  return html`
    <div class="habit-grid-wrap">
      <table class="habit-grid">
        <thead><tr><th></th>${days.map((d) => html`<th class=${sameDay(d, t) ? 'today' : ''}>
          <button class="hg-day" onClick=${() => go('day', d)}>${d.getDate()}</button></th>`)}<th>Done</th></tr></thead>
        <tbody>
          ${habits.map((h) => {
            let count = 0;
            return html`<tr>
              <th class="hg-name">${h.name}</th>
              ${days.map((d) => {
                const on = !!dayDoc(d).habits?.[h.id];
                if (on) count++;
                return html`<td><button class="hg-cell ${on ? 'on' : ''} ${d > t ? 'future' : ''}" aria-pressed=${on}
                  aria-label=${`${h.name} ${ymd(d)}`} onClick=${() => toggle(d, h.id)}></button></td>`;
              })}
              <td class="hg-count">${count}</td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>`;
}

export function MonthView({ date, go }) {
  useAnyChange();
  const [settings] = useSettings();
  const y = date.getFullYear();
  const m = date.getMonth();
  const key = `month:${ym(date)}`;
  const [doc, update] = useDoc(key, { wins: [], lessons: [], letgo: [] });
  const weeks = monthWeeks(y, m);
  const events = useEvents(weeks[0][0], addDays(weeks[weeks.length - 1][6], 1));
  const t = today();
  const theme = MONTH_THEMES[m];
  return html`
    <div class="page month">
      <aside class="month-side">
        <h1 class="ring">${MONTHS[m]}<small>${y}</small></h1>
        <${Block} title="Theme of the month">
          <${Line} cls="theme" value=${doc.theme} placeholder=${theme.title} onInput=${(v) => update((d) => { d.theme = v; })} />
          <p class="hint">${theme.text}</p>
          <${Line} value=${doc.practice} placeholder="How I'll practice it" onInput=${(v) => update((d) => { d.practice = v; })} />
        <//>
        <${Block} title="Wins">
          ${[0, 1, 2].map((i) => html`<${Line} value=${doc.wins[i]} label="Win" onInput=${(v) => update((d) => { d.wins = setAt(d.wins, i, v, 3); })} />`)}
        <//>
        <${Block} title="Lessons">
          ${[0, 1, 2].map((i) => html`<${Line} value=${doc.lessons[i]} label="Lesson" onInput=${(v) => update((d) => { d.lessons = setAt(d.lessons, i, v, 3); })} />`)}
        <//>
        <${Block} title="Letting go of">
          ${[0, 1].map((i) => html`<${Line} value=${doc.letgo[i]} label="Letting go of" onInput=${(v) => update((d) => { d.letgo = setAt(d.letgo, i, v, 2); })} />`)}
        <//>
        <${NotesBox} docKey=${key} label="Notes" />
      </aside>
      <div class="month-main">
        <div class="month-grid" style=${`--rows:${weeks.length}`}>
          <div class="mg-corner">Wk</div>
          ${DAYS.map((d) => html`<div class="mg-dow">${d.slice(0, 3).toUpperCase()}</div>`)}
          ${weeks.map((row) => html`
            <button class="mg-week" onClick=${() => go('week', row[0])} title="Open week">${weekNumber(row[0])}</button>
            ${row.map((d) => {
              if (d.getMonth() !== m) return html`<div class="mg-cell out"></div>`;
              const dd = dayDoc(d);
              const evs = events.get(ymd(d)) || [];
              const virtues = VIRTUES.filter((v) => dd.virtues?.[v.id]).length;
              return html`
                <button class="mg-cell ${sameDay(d, t) ? 'today' : ''} ${dd.mood ? 'mood m' + dd.mood : ''}" onClick=${() => go('day', d)}
                  aria-label=${`${MONTHS[m]} ${d.getDate()}`}>
                  <span class="mg-num">${d.getDate()}</span>
                  ${dd.intention && html`<span class="mg-int">${dd.intention}</span>`}
                  <span class="mg-foot">
                    ${virtues > 0 && html`<span class="vdots">${VIRTUES.map((v) => html`<i class=${`v${dd.virtues?.[v.id] || 0}`}></i>`)}</span>`}
                    ${evs.length > 0 && html`<span class="mg-evcount" title=${evs.map((e) => e.title).join(', ')}>${evs.length} ${evs.length === 1 ? 'event' : 'events'}</span>`}
                  </span>
                </button>`;
            })}`)}
        </div>
        <${MoodLegend} />
        <h2 class="phase">Habits</h2>
        <${HabitGrid} y=${y} m=${m} habits=${settings.habits || []} go=${go} />
        <${MonthReview} y=${y} m=${m} settings=${settings} />
      </div>
    </div>`;
}

const MoodLegend = () => html`<div class="legend">
  <span>Mood</span>${[1, 2, 3, 4, 5].map((n) => html`<i class=${`m${n}`}>${n}</i>`)}
  <span class="legend-v">Virtues</span><span class="vdots"><i class="v1"></i></span> partly <span class="vdots"><i class="v2"></i></span> yes
</div>`;

// ---------- Year ----------

function MiniMonth({ y, m, go }) {
  const t = today();
  return html`
    <div class="mini">
      <button class="mini-title" onClick=${() => go('month', new Date(y, m, 1))}>${MONTHS[m]}</button>
      <div class="mini-grid">
        ${DAYS.map((d) => html`<span class="mini-dow">${d[0]}</span>`)}
        ${monthWeeks(y, m).flat().map((d) => {
          if (d.getMonth() !== m) return html`<span></span>`;
          const dd = dayDoc(d);
          return html`<button class="mini-day ${sameDay(d, t) ? 'today' : ''} ${dd.mood ? 'mood m' + dd.mood : ''} ${!dd.mood && hasContent(dd) ? 'mark' : ''}"
            onClick=${() => go('day', d)}>${d.getDate()}</button>`;
        })}
      </div>
    </div>`;
}

function yearStats(y) {
  let journaled = 0; let moodSum = 0; let moodN = 0; let virtueDays = 0;
  for (const k of store.keys()) {
    if (!k.startsWith(`day:${y}-`)) continue;
    const d = store.get(k) || {};
    if (hasContent(d)) journaled++;
    if (d.mood) { moodSum += d.mood; moodN++; }
    if (VIRTUES.every((v) => d.virtues?.[v.id])) virtueDays++;
  }
  return { journaled, mood: moodN ? (moodSum / moodN).toFixed(1) : '–', virtueDays };
}

export function YearView({ date, go }) {
  useAnyChange();
  const y = date.getFullYear();
  const [tab, setTab] = useState('year');
  const [settings] = useSettings();
  const [q, setQ] = useState(() => (date.getFullYear() === today().getFullYear() ? quarterOf(today()) : 4));
  const [doc, update] = useDoc(`year:${y}`, { values: [], letgo: [] });
  const stats = yearStats(y);
  return html`
    <div class="page year">
      <header class="page-head">
        <h1 class="display">${tab === 'year' ? y : tab === 'quarters' ? `${y} quarters` : 'Memento mori'}</h1>
        <div class="seg">
          <button class=${tab === 'year' ? 'on' : ''} onClick=${() => setTab('year')}>${y}</button>
          <button class=${tab === 'quarters' ? 'on' : ''} onClick=${() => setTab('quarters')}>Quarters</button>
          <button class=${tab === 'life' ? 'on' : ''} onClick=${() => setTab('life')}>Life in weeks</button>
        </div>
      </header>
      ${tab === 'year' ? html`
        <div class="year-layout">
          <aside class="year-side">
            <${Block} title="Who I want to become">
              <${Area} rows=${4} value=${doc.become} label="Who I want to become" onInput=${(v) => update((d) => { d.become = v; })} />
            <//>
            <${Block} title="Values I live by">
              ${[0, 1, 2].map((i) => html`<${Line} value=${doc.values[i]} label="Value" onInput=${(v) => update((d) => { d.values = setAt(d.values, i, v, 3); })} />`)}
            <//>
            <${Block} title="What I'll let go of">
              ${[0, 1].map((i) => html`<${Line} value=${doc.letgo[i]} label="Let go of" onInput=${(v) => update((d) => { d.letgo = setAt(d.letgo, i, v, 2); })} />`)}
            <//>
            <div class="stats">
              <div><b>${stats.journaled}</b><small>days journaled</small></div>
              <div><b>${stats.mood}</b><small>average mood</small></div>
              <div><b>${stats.virtueDays}</b><small>days with all four virtues</small></div>
            </div>
          </aside>
          <div>
            <div class="year-grid">${MONTHS.map((_, m) => html`<${MiniMonth} y=${y} m=${m} go=${go} />`)}</div>
            <${MoodLegend} />
          </div>
        </div>`
      : tab === 'quarters' ? html`
        <div class="seg q-seg">${[1, 2, 3, 4].map((n) => html`<button class=${q === n ? 'on' : ''} onClick=${() => setQ(n)}>Q${n}</button>`)}</div>
        <${QuarterReview} y=${y} q=${q} settings=${settings} />`
      : html`<${LifeInWeeks} />`}
    </div>`;
}

function LifeInWeeks() {
  const [settings, update] = useSettings();
  const birth = parseYmd(settings.birthDate || '');
  const years = Math.min(110, Math.max(30, +settings.lifespan || 80));
  if (!birth) {
    return html`<div class="life-empty">
      <p>Your life as a grid of weeks: one row per year, one square per week.</p>
      <label>Your birth date <input type="date" onChange=${(e) => update((s) => { s.birthDate = e.target.value; })} /></label>
      <p class="hint">Stored only in your own journal.</p>
    </div>`;
  }
  const now = today();
  const lived = Math.floor((now - birth) / (7 * 864e5));
  const left = Math.max(0, Math.floor((new Date(birth.getFullYear() + years, birth.getMonth(), birth.getDate()) - now) / (7 * 864e5)));
  const age = Math.floor((now - birth) / (365.25 * 864e5));
  // One row per year of age, so the current square sits at weeks since the last birthday.
  let lastBday = new Date(birth.getFullYear() + age, birth.getMonth(), birth.getDate());
  if (lastBday > now) lastBday = new Date(lastBday.getFullYear() - 1, birth.getMonth(), birth.getDate());
  const col = Math.min(51, Math.floor((now - lastBday) / (7 * 864e5)));
  const rows = [];
  for (let r = 0; r < years; r++) {
    const cells = [];
    for (let c = 0; c < 52; c++) {
      const state = r < age || (r === age && c < col) ? 'past' : r === age && c === col ? 'cur' : '';
      cells.push(html`<i class=${state}></i>`);
    }
    rows.push(html`<div class="life-row"><span class="life-age">${r % 10 === 0 ? r : ''}</span>${cells}</div>`);
  }
  return html`
    <div class="life">
      <div class="life-head">
        <p class="life-big"><b>${lived.toLocaleString('en-US')}</b> weeks lived · <b>${left.toLocaleString('en-US')}</b> to ${years}</p>
        <p class="hint">Age ${age}. Each square is a week. The highlighted one is this week. Change the horizon in Settings.</p>
        <figure class="quote">
          <blockquote>Consider thyself to be dead, and to have completed thy life up to the present time; and live the remainder according to nature.</blockquote>
          <figcaption>Marcus Aurelius · <i>Meditations</i></figcaption>
        </figure>
      </div>
      <div class="life-grid">${rows}</div>
    </div>`;
}
