<!-- github-knowledge-base-start -->
## Knowledge Base

### Purpose

This repository uses the Knowledge Base at [https://github.com/jamesmcnamara/shortlist](https://github.com/jamesmcnamara/shortlist) on branch `main`.

### Required behavior

1. Before changing code, read `docs/index.md` from that branch.
2. Use the index to open only the knowledge files relevant to the task.
3. If the index is unavailable, stop and report that the Knowledge Base could not be loaded.

### Source of truth

Generated knowledge tracks the code. When the knowledge and code disagree, trust the code.
<!-- github-knowledge-base-end -->

## Development login

Local browser testing uses the normal sign-in page and the test credentials in
git-ignored `.dev-user.json`. Never print, commit, or copy those credentials into
documentation or memory. If the file or account is missing, run `npm run dev:seed`.
Do not run `dev:sync` just to log in: it replaces the dev database with production
data. The test user is an admin of shared dev theatres and has its own Watchlist;
other users' personal Watchlists remain private.
