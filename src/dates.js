// Date helpers. Weeks start on Sunday, like the paper planner.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, d || 1);
}

export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d, n) => {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
};
export const startOfWeek = (d) => addDays(d, -d.getDay());
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

// US-style week number (week containing Jan 1 is week 1, Sunday start).
export function weekNumber(d) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const doy = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - jan1) / 864e5);
  return Math.floor((doy + jan1.getDay()) / 7) + 1;
}

// A Sunday-start week is labelled by its Saturday, so Dec 27 - Jan 2 is week 1 of the new year.
export function weekLabel(d) {
  const sat = addDays(startOfWeek(d), 6);
  return { week: weekNumber(sat), year: sat.getFullYear() };
}

// Rows of 7 dates covering a month (Sunday start).
export function monthWeeks(y, m) {
  const first = new Date(y, m, 1);
  let cur = startOfWeek(first);
  const rows = [];
  while (cur.getMonth() === m || rows.length === 0 || (cur <= new Date(y, m + 1, 0))) {
    const row = [];
    for (let i = 0; i < 7; i++) row.push(addDays(cur, i));
    rows.push(row);
    cur = addDays(cur, 7);
    if (cur.getMonth() !== m && cur > first) break;
  }
  return rows;
}

export const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const hourKey = (h) => pad(h);
