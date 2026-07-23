# JobDex

Pokémon-themed job board for high-growth tech (fintech/CFO stack, AI inference, dev tools, HR tech, AI agents, cyber, frontier labs, healthcare AI). Live at https://finstack-jobs.netlify.app

## How it works
- `index.html` — the entire site (single file). The `COMPANIES` array inside it is the source of truth for tracked companies.
- `data/jobs.json` — pre-fetched job data, refreshed every 6h by the GitHub Action (`.github/workflows/refresh-jobs.yml` → `scripts/fetch-jobs.mjs`). The page loads this instantly and falls back to live ATS fetching if it's missing. Visitors can force live data with the "refresh live" link.
- `snapshots/` — monthly Hiring Index snapshots (taken on the 1st by a scheduled Cowork task; the summary point is appended to `INDEX_DATA` in index.html).
- Trainer accounts (profiles/saved roles/resumes) run on Supabase; the anon key in index.html is public by design, with row-level security enforcing per-user access.

## Editing rules
- **index.html in this repo is canonical.** Never deploy a copy from anywhere else.
- Add a company: one line in `COMPANIES` (grab the slug from the company's careers URL: job-boards.greenhouse.io/SLUG, jobs.lever.co/SLUG, or jobs.ashbyhq.com/SLUG).
- Netlify auto-deploys on push to main; the Action's data commits redeploy the site with fresh jobs.
