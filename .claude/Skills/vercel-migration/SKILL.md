---
name: vercel-migration
description: Deploy or redeploy this static site to Vercel (replaces/supplements GitHub Pages hosting), including project setup, custom domain, and the two OAuth/Firebase config updates sign-in needs after any domain change. Use whenever hosting moves to or changes on Vercel, or a custom domain is added.
---

# Vercel migration

Static site, zero build step (see root `CLAUDE.md`) — Vercel needs no
config, deploys the repo as-is. This did **not** replace GitHub Pages;
both can serve the same repo simultaneously. Nothing in the app code
changes for this migration — only hosting + OAuth/Firebase allow-lists.

## Current state (as of this migration)

- Vercel project: `deped-class-submissions`, org `ianmike9114s-projects`.
- Production URL: `https://deped-class-submissions.vercel.app`
- Linked via `.vercel/project.json` (gitignored, machine-local — a fresh
  clone/worktree needs `vercel link --yes --project
  deped-class-submissions` again before `vercel deploy` will work).
- No `vercel.json` in repo — not needed for a plain static site (Vercel
  serves repo root as-is, same as GitHub Pages does).

## Deploying (first time or redeploy)

```bash
vercel login          # only if `vercel whoami` shows not logged in
vercel link --yes --project deped-class-submissions   # only if .vercel/ missing
vercel deploy --prod --yes
```

Preview (non-production) deploys: same command without `--prod` — gets
its own throwaway `*.vercel.app` URL, doesn't touch the production alias
or require the OAuth/Firebase steps below (fine for visual checks, but
sign-in won't work on a preview URL unless that exact URL is also
allow-listed).

## Required after ANY new domain (production URL, custom domain, or
## even a new preview URL you want sign-in to work on)

Two config changes live outside this repo, on the user's own Google/
Firebase accounts — Claude cannot make these (account security
settings), user must do them manually:

1. **Google Cloud Console** → APIs & Services → Credentials → the OAuth
   2.0 Client ID matching `GOOGLE_CLIENT_ID` in
   `js/firebase-config.js` → **Authorized JavaScript origins** → add the
   new origin, e.g. `https://deped-class-submissions.vercel.app` (no
   trailing slash, no path).
2. **Firebase Console** → Authentication → Settings →
   **Authorized domains** → add the bare domain, e.g.
   `deped-class-submissions.vercel.app`.

Skipping either step: Google Identity Services button either does
nothing or throws in console — same `initGoogleSignIn()` codepath
`js/auth.js` uses for GitHub Pages, just a different unauthorized-origin
error. Not a code bug, config-only.

## Custom domain (optional, e.g. a real school/personal domain)

1. Vercel dashboard → project → Settings → Domains → add the domain.
2. Vercel shows the DNS records to add (A/CNAME) — done at the domain
   registrar, outside Vercel and outside this repo; Claude has no access
   to any registrar, user does this step themselves.
3. Once DNS propagates and Vercel shows the domain as Valid, repeat the
   two OAuth/Firebase allow-list steps above for the custom domain (in
   addition to, not instead of, the `.vercel.app` one — keep both
   working).

## Renaming/removing the Vercel project

`vercel link` with no `--project` flag creates a **new** project named
after the current directory (a problem in this repo specifically — the
working directory is a git-worktree path like
`.claude/worktrees/<random-name>`, so an unqualified `vercel link`
produces a garbage project name). Always pass `--project
deped-class-submissions` explicitly. To rename an existing project:
`vercel project rename <old-name> <new-name>`. To delete a stray one:
`vercel remove <name> --yes`.
