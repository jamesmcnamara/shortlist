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
all dev Watchlists and other lists are publicly viewable, including by signed-out
visitors. Do not use `dev:sync` to test permissions; it replaces the dev database
with production data.

## Responsive design priorities

This is a mostly personal app. Prioritize the owner's Samsung ZFold 8 while
preserving a good responsive experience for the friends using other phones.
For UI changes, consider all four reference viewports:

| Fold state | Orientation | CSS viewport (width x height) |
| --- | --- | --- |
| Closed | Portrait | 476 x 752 |
| Closed | Landscape | 752 x 476 |
| Unfolded | Portrait | 704 x 933 |
| Unfolded | Landscape | 933 x 704 |

The portrait dimensions come from Chrome DevTools; landscape references swap
those dimensions. The device pixel ratio is 2.625, but media queries use CSS
pixels without multiplying or dividing by that ratio. Actual viewport height
can vary with browser controls and the on-screen keyboard.

Use content-driven media queries to adapt layouts at these sizes, including
landscape, rather than exact width/height or device-model matching. These
viewports are priority checks, not exclusive targets: keep layouts usable at
intermediate widths and on other phones, and do not assume viewport size
reliably identifies the physical fold state.
