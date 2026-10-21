// Local-first document store (IndexedDB) with optional Supabase sync.
// Every planner page is one JSON document under a key like "day:2026-11-04".

const DB_NAME = 'planner';
let db = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('docs');
      req.result.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode, fn) {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const result = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const metaGet = (key) => tx('meta', 'readonly', (s) => s.get(key));
export const metaSet = (key, value) => tx('meta', 'readwrite', (s) => s.put(value, key));

const docs = new Map(); // key -> { data, updated_at, dirty }
const listeners = new Map(); // key or '*' -> Set<fn>
let statusListeners = new Set();

export const sync = { status: 'local', email: null, client: null, userId: null };

function emit(key) {
  for (const k of [key, '*']) listeners.get(k)?.forEach((fn) => fn(key));
}

export function setStatus(status) {
  sync.status = status;
  statusListeners.forEach((fn) => fn(status));
}

export const store = {
  async init() {
    try {
      db = await openDb();
      await new Promise((resolve, reject) => {
        const t = db.transaction('docs', 'readonly');
        const req = t.objectStore('docs').openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return resolve();
          docs.set(c.key, c.value);
          c.continue();
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('IndexedDB unavailable, data stays in memory only', err);
      db = null;
    }
  },

  get(key) {
    return docs.get(key)?.data;
  },

  keys() {
    return [...docs.keys()];
  },

  set(key, data) {
    const rec = { data, updated_at: new Date().toISOString(), dirty: true };
    docs.set(key, rec);
    tx('docs', 'readwrite', (s) => s.put(rec, key)).catch(console.warn);
    emit(key);
    schedulePush();
  },

  subscribe(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
  },

  onStatus(fn) {
    statusListeners.add(fn);
    return () => statusListeners.delete(fn);
  },

  // Apply a document coming from the server (last write wins on client timestamps).
  applyRemote(key, data, updated_at) {
    const local = docs.get(key);
    if (local && local.dirty && local.updated_at >= updated_at) return;
    if (local && !local.dirty && local.updated_at === updated_at) return;
    const rec = { data, updated_at, dirty: false };
    docs.set(key, rec);
    tx('docs', 'readwrite', (s) => s.put(rec, key)).catch(console.warn);
    emit(key);
  },

  markClean(key, updated_at) {
    const rec = docs.get(key);
    if (rec && rec.updated_at === updated_at) {
      rec.dirty = false;
      tx('docs', 'readwrite', (s) => s.put(rec, key)).catch(console.warn);
    }
  },

  dirty() {
    return [...docs.entries()].filter(([, r]) => r.dirty);
  },

  exportAll() {
    return Object.fromEntries([...docs.entries()].map(([k, r]) => [k, r.data]));
  },

  importAll(obj) {
    for (const [k, v] of Object.entries(obj)) this.set(k, v);
  },

  async clear() {
    docs.clear();
    await tx('docs', 'readwrite', (s) => s.clear());
    await tx('meta', 'readwrite', (s) => s.clear());
    emit('*');
  },
};

// ---------- Supabase sync ----------

let pushTimer = null;
let pulling = false;

function schedulePush() {
  if (!sync.userId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1200);
}

export async function push() {
  if (!sync.userId || !navigator.onLine) return;
  const dirty = store.dirty();
  if (!dirty.length) return;
  setStatus('syncing');
  const rows = dirty.map(([key, r]) => ({ user_id: sync.userId, key, data: r.data, updated_at: r.updated_at }));
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sync.client.from('docs').upsert(chunk, { onConflict: 'user_id,key' });
    if (error) {
      console.warn('push failed', error);
      return setStatus('error');
    }
    chunk.forEach((r) => store.markClean(r.key, r.updated_at));
  }
  setStatus('synced');
}

export async function pull() {
  if (!sync.userId || pulling) return;
  if (!navigator.onLine) return setStatus('offline');
  pulling = true;
  setStatus('syncing');
  try {
    let since = (await metaGet('lastSyncedAt')) || '1970-01-01T00:00:00Z';
    // Overlap a few seconds so rows committed late are never skipped.
    since = new Date(new Date(since).getTime() - 5000).toISOString();
    let maxSeen = since;
    for (;;) {
      const { data, error } = await sync.client
        .from('docs')
        .select('key,data,updated_at,synced_at')
        .gt('synced_at', since)
        .order('synced_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      for (const row of data) {
        store.applyRemote(row.key, row.data, new Date(row.updated_at).toISOString());
        if (row.synced_at > maxSeen) maxSeen = row.synced_at;
      }
      if (data.length < 500) break;
      since = maxSeen;
    }
    await metaSet('lastSyncedAt', maxSeen);
    setStatus('synced');
    await push();
  } catch (err) {
    console.warn('pull failed', err);
    setStatus('error');
  } finally {
    pulling = false;
  }
}

export function startSync(client, user) {
  sync.client = client;
  sync.userId = user.id;
  sync.email = user.email;
  pull();
}

export function stopSync() {
  sync.userId = null;
  sync.email = null;
  setStatus(sync.client ? 'signed-out' : 'local');
}

let loopStarted = false;
export function startSyncLoop() {
  if (loopStarted) return;
  loopStarted = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pull();
    else push();
  });
  window.addEventListener('online', pull);
  window.addEventListener('offline', () => setStatus('offline'));
  setInterval(() => document.visibilityState === 'visible' && pull(), 30000);
}
