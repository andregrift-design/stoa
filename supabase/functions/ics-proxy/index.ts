// Fetches a calendar feed (.ics) for the signed-in user, because browsers
// can't read iCloud feeds directly. Keep "Verify JWT" enabled for this function.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { url } = await req.json();
    const target = String(url || '').trim().replace(/^webcal:\/\//i, 'https://');
    if (!/^https:\/\//i.test(target)) {
      return new Response('Only https/webcal calendar links are allowed', { status: 400, headers: cors });
    }
    const res = await fetch(target, { headers: { 'User-Agent': 'Planner/1.0', Accept: 'text/calendar' } });
    const text = await res.text();
    if (!res.ok || !text.includes('BEGIN:VCALENDAR')) {
      return new Response(`Calendar fetch failed (${res.status})`, { status: 502, headers: cors });
    }
    return new Response(text, { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8' } });
  } catch (err) {
    return new Response(String(err), { status: 500, headers: cors });
  }
});
