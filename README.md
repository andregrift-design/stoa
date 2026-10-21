# Stoa

A Stoic day planner and journal for iPhone, iPad and Mac, based on the layout of the Paperlike 2027 planner.

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

## 2. Set up sync (Supabase, free, ~10 minutes)

1. Create an account and a **New project** at https://supabase.com (region: Frankfurt is closest).
2. **SQL Editor** → New query → paste `supabase/schema.sql` → **Run**.
3. **Authentication → Emails → Magic Link** template: add this line so you can sign in with a code (needed for the home-screen app on iPhone/iPad):
   ```
   <p>Your code: <b>{{ .Token }}</b></p>
   ```
4. **Authentication → URL Configuration**: set **Site URL** to your GitHub Pages address (step 3 below, e.g. `https://YOURNAME.github.io/planner/`) and add `http://localhost:8765/` under Redirect URLs.
5. **Edge Functions → Deploy a new function → Via Editor**: name it `ics-proxy`, paste `supabase/functions/ics-proxy/index.ts`, deploy. Leave "Verify JWT" on.
6. **Project Settings → API**: copy the Project URL and the `anon` (publishable) key into `src/config.js`. This key is meant to be public; row-level security keeps your data private.
7. After you've signed in on all your devices: **Authentication → Sign In / Providers** → turn off **Allow new users to sign up**, so nobody else can create an account.

## 3. Host it (GitHub Pages, free)

1. Create a repository named `planner` on github.com (public; your planner data is not in it, only the app code).
2. Push this folder:
   ```bash
   cd ~/Documents/Planner
   git add -A && git commit -m "Planner app"
   git branch -M main
   git remote add origin https://github.com/YOURNAME/planner.git
   git push -u origin main
   ```
3. Repository **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)`.
4. After a minute it's live at `https://YOURNAME.github.io/planner/`.

To ship a change later: commit, push, and bump `VERSION` in `sw.js` so devices pick it up.

## 4. Install on your devices

- **iPhone / iPad**: open the address in Safari → Share → **Add to Home Screen**.
- **Mac**: Safari → File → **Add to Dock**.
- Open the app → ⚙︎ → enter your email → **Send code** → type the 6-digit code.

## 5. Show your Apple Calendar

1. Mac Calendar app: right-click a calendar → **Share Calendar…** → tick **Public Calendar** → copy the `webcal://` link.
   (Anyone with that link can view that calendar; it's long and unguessable, but don't share it.)
2. Stoa → ⚙︎ → Calendar → paste the link, give it a name → **Add**.
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
