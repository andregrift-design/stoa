# Ataraxia

Ataraxia (Greek: tranquility of mind) is a Stoic day planner and journal for iPhone, iPad and Mac, based on the layout of the Paperlike 2027 planner.

- **Day**: a quote of the day, then three parts.
  - Morning: your intention, premeditatio malorum (what could go wrong, and how you'll respond) and the dichotomy of control.
  - Through the day: today's calendar events, habits, mood and energy, gratitude.
  - Evening: a check-in on the four virtues, Seneca's three review questions, a reflection on the quote, and a journal page you can type or write in with Apple Pencil.
- **Week**: a Stoic exercise to practice, your focus, an overview of the seven days (intention, mood, virtues, habits) and a weekly review.
- **Month**: a theme for the month, wins, lessons, what you're letting go of, a calendar colored by mood, and a habit grid.
- **Year**: who you want to become, your values, a year calendar colored by mood, and stats. Plus **Life in weeks**, a memento mori grid.
- Sync between your devices through your own free Supabase project. Works offline. Light and dark mode.

Quotes are adapted from public-domain translations (George Long, Richard Gummere and others), and rotate daily.

No build step: plain HTML, CSS and JavaScript modules.

## 1. Try it locally

```bash
python3 -m http.server 8765 --directory ~/Documents/Planner
```

Open http://localhost:8765. Without Supabase configured, data stays in that browser only.

## 2. Sync (Supabase)

Already set up in the Supabase project `stoa` (Frankfurt):

- `supabase/schema.sql` created the `docs` table with row-level security.
- `supabase/functions/ics-proxy/index.ts` is deployed as the `ics-proxy` edge function.
- `src/config.js` holds the project URL and publishable key (public by design).
- Authentication → URL Configuration: Site URL is the GitHub Pages address.

Sign-in is email + password. After your devices are signed in, you can turn off
**Authentication → Sign In / Providers → Allow new users to sign up** so nobody else can create an account.

## 3. Hosting (GitHub Pages)

Live at **https://andregrift-design.github.io/stoa/** from the `main` branch of
`andregrift-design/stoa`. To ship a change: commit, bump `VERSION` in `sw.js`, and push.

## 4. Install on your devices

- **iPhone / iPad**: open the address in Safari → Share → **Add to Home Screen**.
- **Mac**: Safari → File → **Add to Dock**.
- Open the app → ⚙︎ → sign in with your email and password.

## 5. Show your Apple Calendar

1. Mac Calendar app: right-click a calendar → **Share Calendar…** → tick **Public Calendar** → copy the `webcal://` link.
   (Anyone with that link can view that calendar; it's long and unguessable, but don't share it.)
2. Ataraxia → ⚙︎ → Calendar → paste the link, give it a name → **Add**.
3. Repeat per calendar. Events refresh every 15 minutes and when you open the app.

Calendar feeds are read-only: add or change events in Apple Calendar itself.

## How data is stored

Each page is one JSON document (`day:2026-11-04`, `month:2026-11`, `year:2027`, `settings`) in IndexedDB on the device, synced to the `docs` table. When two devices change the same page, the latest edit wins. Settings → **Download backup** exports everything as JSON.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Page shell and look (matches the PDF) |
| `src/views.js` | Year, month, week and day pages |
| `src/main.js` | Navigation, settings, sign-in, startup |
| `src/db.js` | Local storage and Supabase sync |
| `src/calendar.js` | Calendar feeds (.ics) |
| `src/ink.js` | Apple Pencil handwriting |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen app |
| `supabase/` | Database schema and calendar proxy |
