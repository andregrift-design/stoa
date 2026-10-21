import { html, render, useEffect, useState, useReducer } from './ui.js';
import { store, sync, startSync, stopSync, startSyncLoop, setStatus, pull } from './db.js';
import { refreshFeeds, feedErrors, onEvents } from './calendar.js';
import { YearView, MonthView, WeekView, DayView, useSettings } from './views.js';
import { DEFAULT_BODY } from './stoic.js';
import { MONTHS, ymd, parseYmd, today, addDays, addMonths, startOfWeek, weekLabel } from './dates.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const VIEWS = ['year', 'month', 'week', 'day'];

// ---------- routing: #/day/2026-11-04 ----------

function readHash() {
  const [, view, date] = location.hash.split('/');
  return { view: VIEWS.includes(view) ? view : 'day', date: parseYmd(date) || today() };
}

function useRoute() {
  const [route, setRoute] = useState(readHash);
  useEffect(() => {
    const fn = () => setRoute(readHash());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  const go = (view, date) => { location.hash = `/${view}/${ymd(date)}`; };
  return [route, go];
}

function step(view, date, dir) {
  if (view === 'year') return new Date(date.getFullYear() + dir, date.getMonth(), 1);
  if (view === 'month') return addMonths(date, dir);
  if (view === 'week') return addDays(startOfWeek(date), 7 * dir);
  return addDays(date, dir);
}

function titleFor(view, date) {
  if (view === 'year') return String(date.getFullYear());
  if (view === 'month') return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  if (view === 'week') { const w = weekLabel(date); return `Week ${w.week}, ${w.year}`; }
  return `${MONTHS[date.getMonth()].slice(0, 3)} ${date.getDate()}, ${date.getFullYear()}`;
}

// ---------- theme ----------

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

// ---------- app ----------

function SyncDot({ onClick }) {
  const [status, set] = useState(sync.status);
  useEffect(() => store.onStatus(set), []);
  const label = {
    local: 'On this device only', 'signed-out': 'Not signed in', syncing: 'Syncing…',
    synced: 'Synced', offline: 'Offline, will sync later', error: 'Sync problem',
  }[status] || status;
  return html`<button class="sync-dot ${status}" onClick=${onClick} title=${label} aria-label=${label}><i></i><span>${label}</span></button>`;
}

function App() {
  const [{ view, date }, go] = useRoute();
  const [settings] = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => store.onStatus(force), []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);
  useEffect(() => { document.querySelector('.content')?.scrollTo(0, 0); }, [view, ymd(date)]);
  useEffect(() => { refreshFeeds(settings.calendars); }, [JSON.stringify(settings.calendars), sync.userId]);
  useEffect(() => {
    const id = setInterval(() => refreshFeeds(settings.calendars), 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [JSON.stringify(settings.calendars)]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') go(view, step(view, date, -1));
      else if (e.key === 'ArrowRight') go(view, step(view, date, 1));
      else if (e.key === 't') go(view, today());
      else if ({ y: 1, m: 1, w: 1, d: 1 }[e.key]) go(VIEWS.find((v) => v[0] === e.key), date);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const View = { year: YearView, month: MonthView, week: WeekView, day: DayView }[view];
  const tabs = html`${VIEWS.map((v) => html`
    <button class=${v === view ? 'on' : ''} onClick=${() => go(v, date)}>${v[0].toUpperCase() + v.slice(1)}</button>`)}`;

  return html`
    <div class="app">
      <header class="topbar">
        <div class="nav">
          <button class="icon" onClick=${() => go(view, step(view, date, -1))} aria-label="Previous">‹</button>
          <button class="today-btn" onClick=${() => go(view, today())}>Today</button>
          <button class="icon" onClick=${() => go(view, step(view, date, 1))} aria-label="Next">›</button>
        </div>
        <div class="crumb-title">${titleFor(view, date)}</div>
        <nav class="seg views">${tabs}</nav>
        <${SyncDot} onClick=${() => setShowSettings(true)} />
        <button class="icon gear" onClick=${() => setShowSettings(true)} aria-label="Settings">⚙︎</button>
      </header>
      <main class="content"><${View} date=${date} go=${go} /></main>
      <nav class="month-tabs" aria-label="Months">
        ${MONTHS.map((m, i) => html`
          <button class=${date.getMonth() === i && view !== 'year' ? 'on' : ''}
            onClick=${() => go('month', new Date(date.getFullYear(), i, 1))}>${m.slice(0, 3).toUpperCase()}</button>`)}
      </nav>
      <nav class="bottombar seg">${tabs}</nav>
      ${showSettings && html`<${Settings} onClose=${() => setShowSettings(false)} />`}
    </div>`;
}

// ---------- settings ----------

const PALETTE = ['#7fb8d8', '#e8a87c', '#9ccc9c', '#c9a0dc', '#f2c14e', '#e57373'];

function Settings({ onClose }) {
  const [settings, update] = useSettings();
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => store.onStatus(force), []);
  useEffect(() => onEvents(force), []);
  const [email, setEmail] = useState(sync.email || '');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [cal, setCal] = useState({ name: '', url: '' });
  const [habit, setHabit] = useState('');
  const [bodyItem, setBodyItem] = useState('');
  const bodyList = settings.body || DEFAULT_BODY;
  const addBody = () => {
    if (!bodyItem.trim()) return;
    update((s) => { s.body = [...(s.body || DEFAULT_BODY), { id: Math.random().toString(36).slice(2, 9), name: bodyItem.trim() }]; });
    setBodyItem('');
  };
  const addHabit = () => {
    if (!habit.trim()) return;
    update((s) => { s.habits = [...(s.habits || []), { id: Math.random().toString(36).slice(2, 9), name: habit.trim() }]; });
    setHabit('');
  };

  const signIn = async () => {
    setMsg('');
    const { error } = await sync.client.auth.signInWithPassword({ email: email.trim(), password });
    setMsg(error ? error.message : 'Signed in.');
    if (!error) setPassword('');
  };
  const signUp = async () => {
    setMsg('');
    if (password.length < 8) return setMsg('Choose a password of at least 8 characters.');
    const { data, error } = await sync.client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) return setMsg(error.message);
    setPassword('');
    setMsg(data.session ? 'Account created and signed in.' : 'Account created. Confirm it with the link in your email, then sign in here.');
  };
  const signOut = async () => {
    if (!confirm('Sign out? Your journal is removed from this device (it stays in your account).')) return;
    await sync.client.auth.signOut();
    await store.clear();
  };
  const addCal = () => {
    if (!cal.url.trim()) return;
    update((s) => {
      s.calendars = [...(s.calendars || []), {
        id: Math.random().toString(36).slice(2, 10),
        name: cal.name.trim() || 'Calendar',
        url: cal.url.trim(),
        color: PALETTE[(s.calendars || []).length % PALETTE.length],
        enabled: true,
      }];
    });
    setCal({ name: '', url: '' });
  };
  const patchCal = (id, patch) => update((s) => { s.calendars = s.calendars.map((c) => (c.id === id ? { ...c, ...patch } : c)); });
  const exportData = () => {
    const blob = new Blob([JSON.stringify(store.exportAll(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ataraxia-backup-${ymd(new Date())}.json`;
    a.click();
  };
  const importData = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then((t) => { store.importAll(JSON.parse(t)); setMsg('Backup imported.'); }).catch((err) => setMsg(String(err)));
  };

  return html`
    <div class="modal-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-label="Settings">
        <header class="modal-head"><h2>Settings</h2><button class="icon" onClick=${onClose} aria-label="Close">✕</button></header>

        <section>
          <h3>Sync across devices</h3>
          ${!sync.client ? html`<p class="hint">Sync isn't set up yet. Fill in <code>src/config.js</code> with your Supabase project (see README). Until then, data stays on this device.</p>`
          : sync.userId ? html`
            <p>Signed in as <b>${sync.email}</b>. Status: ${sync.status}.</p>
            <div class="row"><button onClick=${() => pull()}>Sync now</button><button onClick=${signOut}>Sign out</button></div>`
          : html`
            <p class="hint">Use the same email and password on your iPhone, iPad and Mac. First time? Create your account once.</p>
            <form class="row" onSubmit=${(e) => { e.preventDefault(); signIn(); }}>
              <input type="email" placeholder="you@example.com" value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="email" />
              <input type="password" placeholder="Password" value=${password} onInput=${(e) => setPassword(e.target.value)} autocomplete="current-password" />
              <button type="submit">Sign in</button>
              <button type="button" onClick=${signUp}>Create account</button>
            </form>`}
          ${msg && html`<p class="msg">${msg}</p>`}
        </section>

        <section>
          <h3>Calendar (read-only)</h3>
          <p class="hint">In the Calendar app: right-click a calendar, Share Calendar, tick Public Calendar, copy the link and paste it here.</p>
          ${(settings.calendars || []).map((c) => html`
            <div class="cal-row">
              <input type="color" value=${c.color} onInput=${(e) => patchCal(c.id, { color: e.target.value })} aria-label="Color" />
              <input class="grow" value=${c.name} onInput=${(e) => patchCal(c.id, { name: e.target.value })} aria-label="Name" />
              <label class="toggle"><input type="checkbox" checked=${c.enabled !== false} onChange=${(e) => patchCal(c.id, { enabled: e.target.checked })} /> Show</label>
              <button onClick=${() => update((s) => { s.calendars = s.calendars.filter((x) => x.id !== c.id); })} aria-label="Remove">Remove</button>
              ${feedErrors().get(c.id) && html`<p class="msg err">${feedErrors().get(c.id)}</p>`}
            </div>`)}
          <div class="row">
            <input placeholder="Name" value=${cal.name} onInput=${(e) => setCal({ ...cal, name: e.target.value })} />
            <input class="grow" placeholder="webcal://p00-caldav.icloud.com/published/…" value=${cal.url} onInput=${(e) => setCal({ ...cal, url: e.target.value })} />
            <button onClick=${addCal}>Add</button>
          </div>
          <div class="row"><button onClick=${() => refreshFeeds(settings.calendars)}>Refresh calendars</button></div>
        </section>

        <section>
          <h3>Practice</h3>
          <div class="seg practice">
            ${[['stoic', 'Stoic'], ['buddhist', 'Buddhist'], ['both', 'Both']].map(([v, label]) => html`
              <button class=${(settings.path || 'stoic') === v ? 'on' : ''} onClick=${() => update((s) => { s.path = v; })}>${label}</button>`)}
          </div>
          <p class="hint">${{
            stoic: 'Stoic quotes, themes and exercises; premeditatio, dichotomy of control and the four virtues.',
            buddhist: 'Dhammapada quotes, Buddhist themes and exercises; sitting, letting be, the second arrow, the four immeasurables, and letting go and kindness.',
            both: 'Everything Stoic, plus sitting, the second arrow, the four immeasurables, and letting go and kindness. Quotes and exercises alternate.',
          }[settings.path || 'stoic']}</p>
          <p class="hint small">Switching never deletes anything: entries made in another mode are kept and come back when you switch again.</p>
        </section>

        <section>
          <h3>Habits</h3>
          ${(settings.habits || []).map((h, i) => html`
            <div class="cal-row">
              <input class="grow" value=${h.name} aria-label="Habit name"
                onInput=${(e) => update((s) => { s.habits = s.habits.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)); })} />
              <button onClick=${() => update((s) => { s.habits = s.habits.filter((_, j) => j !== i); })}>Remove</button>
            </div>`)}
          <div class="row">
            <input class="grow" placeholder="New habit, e.g. Meditate 10 min" value=${habit} onInput=${(e) => setHabit(e.target.value)}
              onKeyDown=${(e) => e.key === 'Enter' && addHabit()} />
            <button onClick=${addHabit}>Add</button>
          </div>
        </section>

        <section>
          <h3>How my body feels</h3>
          <p class="hint">What you rate each day. Past ratings are kept if you remove an item.</p>
          ${bodyList.map((b, i) => html`
            <div class="cal-row">
              <input class="grow" value=${b.name} aria-label="Body item name"
                onInput=${(e) => update((s) => { s.body = (s.body || DEFAULT_BODY).map((x, j) => (j === i ? { ...x, name: e.target.value } : x)); })} />
              <button onClick=${() => update((s) => { s.body = (s.body || DEFAULT_BODY).filter((_, j) => j !== i); })}>Remove</button>
            </div>`)}
          <div class="row">
            <input class="grow" placeholder="New item, e.g. Flank ache" value=${bodyItem} onInput=${(e) => setBodyItem(e.target.value)}
              onKeyDown=${(e) => e.key === 'Enter' && addBody()} />
            <button onClick=${addBody}>Add</button>
          </div>
        </section>

        <section>
          <h3>Memento mori</h3>
          <div class="row">
            <label>Birth date
              <input type="date" value=${settings.birthDate || ''} onInput=${(e) => update((s) => { s.birthDate = e.target.value; })} />
            </label>
            <label>Horizon (years)
              <input type="number" min="30" max="110" value=${settings.lifespan || 80} onInput=${(e) => update((s) => { s.lifespan = +e.target.value; })} />
            </label>
            <label>Theme
              <select value=${settings.theme || 'auto'} onChange=${(e) => update((s) => { s.theme = e.target.value; })}>
                <option value="auto">Match device</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h3>Backup</h3>
          <div class="row">
            <button onClick=${exportData}>Download backup</button>
            <label class="file-btn">Import backup<input type="file" accept="application/json" onChange=${importData} /></label>
          </div>
        </section>

        <p class="hint small">Shortcuts on a keyboard: ← → to move, T for today, Y M W D to switch views.</p>
      </div>
    </div>`;
}

// ---------- boot ----------

async function boot() {
  await store.init();
  startSyncLoop();
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const { createClient } = await import(SUPABASE_JS);
      sync.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      setStatus('signed-out');
      sync.client.auth.onAuthStateChange((_event, session) => {
        if (session?.user && session.user.id !== sync.userId) startSync(sync.client, session.user);
        else if (!session && sync.userId) stopSync();
      });
      const { data } = await sync.client.auth.getSession();
      if (data.session?.user) startSync(sync.client, data.session.user);
    } catch (err) {
      console.warn('Supabase unavailable (offline?)', err);
      setStatus('offline');
    }
  }
  const root = document.getElementById('app');
  root.textContent = ''; // drop the "Loading…" placeholder
  render(html`<${App} />`, root);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  }
}

boot();
