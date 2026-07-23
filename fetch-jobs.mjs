// JobDex data prefetcher — runs in GitHub Actions every 6h.
// Reads the COMPANIES registry straight out of index.html (single source of
// truth), fetches every ATS feed server-side, and writes data/jobs.json so
// visitors download one cached file instead of hitting ~120 APIs.
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/const COMPANIES=\[([\s\S]*?)\n\];/);
if (!m) { console.error('COMPANIES array not found in index.html'); process.exit(1); }
const COMPANIES = eval('[' + m[1] + ']');

const TIMEOUT = 10000;
function tf(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
}

async function gh(slug) {
  const r = await tf(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  if (!r.ok) throw 0;
  const d = await r.json();
  if (!d.jobs || !d.jobs.length) throw 0;
  return d.jobs.map(j => ({ title: j.title, url: j.absolute_url, loc: j.location ? j.location.name : '',
    dept: (j.metadata || []).map(x => x.value).filter(v => typeof v === 'string').join(' '),
    date: j.first_published || j.updated_at || null }));
}
async function lever(slug) {
  const r = await tf(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!r.ok) throw 0;
  const d = await r.json();
  if (!Array.isArray(d) || !d.length) throw 0;
  return d.map(j => ({ title: j.text, url: j.hostedUrl, loc: (j.categories && j.categories.location) || '',
    dept: [(j.categories || {}).team, (j.categories || {}).department].filter(Boolean).join(' '),
    date: j.createdAt ? new Date(j.createdAt).toISOString() : null, wp: j.workplaceType || '' }));
}
async function ashby(slug) {
  const r = await tf(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
  if (!r.ok) throw 0;
  const d = await r.json();
  if (!d.jobs || !d.jobs.length) throw 0;
  return d.jobs.filter(j => j.isListed !== false).map(j => ({ title: j.title, url: j.jobUrl || j.applyUrl,
    loc: j.location || '', dept: [j.department, j.team].filter(Boolean).join(' '),
    date: j.publishedAt || null, remote: j.isRemote === true }));
}
const FETCHERS = { gh, lever, ashby };

const state = {}; const jobs = [];
async function loadCompany(c) {
  for (const [type, slug] of c.candidates) {
    const f = FETCHERS[type]; if (!f) continue;
    try {
      const js = await f(slug);
      state[c.name] = { status: 'ok', count: js.length, ats: type };
      for (const j of js) jobs.push({ co: c.name, ...j });
      return;
    } catch (e) { /* try next candidate */ }
  }
  state[c.name] = { status: 'err', count: 0, ats: null };
}

async function run(list, workers = 4) {
  const q = [...list];
  await Promise.all(Array.from({ length: workers }, async () => {
    while (q.length) await loadCompany(q.shift());
  }));
}

await run(COMPANIES);
// one retry pass for rate-limit hiccups
const errs = COMPANIES.filter(c => state[c.name].status === 'err');
if (errs.length) { await new Promise(r => setTimeout(r, 4000)); await run(errs); }

const out = {
  generated: new Date().toISOString(),
  companies: Object.entries(state).map(([name, s]) => ({ name, ...s })),
  jobs,
};
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/jobs.json', JSON.stringify(out));
const ok = out.companies.filter(c => c.status === 'ok').length;
console.log(`wrote data/jobs.json: ${jobs.length} jobs from ${ok}/${COMPANIES.length} companies`);
