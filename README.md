# Movie Shortlist

A tiny Next.js + Vercel + Neon app for deciding what to watch, built on Drizzle ORM.

## Theatres

All content lives in a **theatre**, which is a shared watch list. Every movie,
comment and watched marking is scoped to one. Members only ever see the theatres
they belong to; theatres are joined through a shareable invite link. Admins can
rename a theatre, manage its members and rotate its invite links from its settings
page.

The **Share** menu item copies the member invite link, `/join/<code>`. Anyone
with that link can view the theatre read-only while signed out. Signed-in
visitors join as members and are taken to the normal theatre. Admin invite
links show the same preview while signed out, but grant admin access when
opened while signed in. All members can share the member link; only admins can
access admin links or rotate either kind. Rotating a link revokes both preview
and join access through it, without removing existing members.

The separate `/share/...` links have been removed and no longer work. Deploy
the updated app before applying migration `0024_sticky_stardust.sql`, which
drops the unused `theatres.share_code` column. Existing invite links and
memberships are preserved.

### Bulk movie import

At the bottom of a list, below Watched, choose **Import movies**. Paste one movie
title per line, then start the import. Each title uses the first TMDB search match without a review
step; the results show the matched movie and year so you can spot incorrect
matches and remove them from the list. Each title can be up to 300 characters.

Movies are added one at a time under your name, with no note. Blank lines and
repeated titles are ignored. Movies already on the list (including Watched) are
skipped without changing their notes or status. Missing matches and failures are
reported separately, and other titles continue importing. **Stop** finishes the
current movie before pausing; use **Continue import** for remaining titles or
**Retry failed titles** for errors.
Keep the page open while importing; navigating away stops further requests but
does not undo movies already added.

### Movie notifications

Each list has a **Notify me when someone adds a movie** checkbox above the
movie import control. Notifications are off by default. Enabling them requests
browser permission and registers the current device; the list preference applies
to all devices you have enabled. On another device, choose **Enable on this
device** for a list you already follow. Turning off the checkbox stops alerts
for that list on all your devices. Signing out disconnects the current browser.

New nominations, including successful bulk imports, notify opted-in members
other than the person adding the movie. Duplicate imports do not send alerts.
Tapping a notification opens its list. Android Chrome supports this without
installing the PWA; iOS requires a Home Screen install. HTTPS is required, except
for local development on localhost. The production service worker is generated
during the build; the development server does not enable it.

To configure delivery:

1. Run `npx web-push generate-vapid-keys` once.
2. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`
   (a contact URL or `mailto:` address) in `.env.local` and Vercel's production
   environment. Keep the private key secret and retain the same key pair across
   deployments. The public key is embedded at build time, so redeploy after
   configuring it.
3. Apply the new Drizzle migration with `npm run db:migrate` against the intended
   database before deploying.

The existing Node.js routes send Web Push using Next.js `after()`, so delivery
does not hold up the movie-add response. Each send has a five-second timeout and
a one-hour push-service expiry. Failed sends are logged without private endpoint
details; expired subscriptions (404/410) are removed. There is no durable queue
or automatic retry, and browser/OS settings can delay or prevent notifications.
Without the VAPID configuration, movie additions work normally and the
notification control explains that setup is still needed.

### JustWatch streaming availability

New movies fetch US availability from JustWatch's unofficial GraphQL endpoint
and store it in `movie.details.justWatch`. No API key or schema migration is
needed. Search results and movie discussions show service icons and direct
links, excluding purchases. Free and ad-supported offers are labeled; other
offers require a subscription. Kanopy may require library access. Rentals are
shown only for services marked `rent: true` (Amazon and Apple), and only when no
free or subscription offer exists. JustWatch no longer lists Google rentals in
the US.

The shared row accepts a service list. Its default list lives in
`app/lib/streaming-services.ts`. IDs are JustWatch package IDs, not TMDB
provider IDs, and include the separate Netflix and Prime Video ad-supported
packages plus Amazon's rental store (10) and the Apple TV Store (2). HBO through
Amazon Channels is not included because it requires a separate subscription.
Availability is stored independently of this filter so changing the configured
services does not require refetching every movie. Movies checked before rentals
were added need a refresh to pick them up.

Older movies remain usable without availability data. Lookup failures do not
prevent creating a movie and are shown as unavailable, not as "no services."
Bulk refresh failures preserve previous data. Movies are matched by their TMDB
ID, never just their title; unmatched movies are reported separately.
The row links to JustWatch for attribution. This undocumented endpoint may
change or stop working, and cached availability can become outdated.

### Box Office Mojo financial data

Each new nomination, including a successful bulk import, looks up the movie's
Box Office Mojo title page by IMDb ID. The request waits for this lookup, with
a ten-second network timeout. Duplicate imports and movie searches do not scrape.
No additional API key or database migration is needed.

Successful lookups store `movie.details.boxOffice`: USD production budget,
domestic, international and worldwide lifetime grosses, the source URL, and
`fetchedAt`. The scraper reads the **All Releases** summary, including re-releases,
not an individual release's totals. Missing amounts are `null`, not zero.
When Mojo omits the budget, enrichment fills `boxOffice.budget` from the saved
TMDB budget if it is a positive whole-dollar amount. Mojo budgets always take
priority, including an explicit zero. Gross receipts still come only from Mojo;
a failed scrape does not create or overwrite box office data.
TMDB's `budget` and `revenue` are unchanged. Movie metadata is shared across
theatres.

Missing IMDb IDs are logged and skipped. HTTP errors, timeouts, blocked pages,
and unexpected markup are logged without preventing the nomination. Failed
lookups leave any previously saved Mojo figures untouched. There is no scheduled
refresh or automatic retry; `fetchedAt` is when the page was read, not when Mojo
last updated its numbers.

Movie discussions show a compact financial sentence: "Made $15.9m (1.59x) on $10m"
or "Lost $5m (-0.5x) on $10m", with inline colors on the figures. Unknown returns
use a neutral "Net" label instead. Dollar amounts are rounded down to three
significant digits (for example, `$15.9m` or `$100k`). Net is worldwide gross minus
production budget; the return multiplier is net divided by budget (150% is 1.5x).
Multipliers are clipped toward zero to at most two decimal places, one above 2x,
and none above 10x.
The comparison table includes sortable Total return and Return multiplier rows.
Relative colors rank each row's raw values. Absolute Total return colors run
from -$100m (red) through $0 (white) to +$100m (green); Return multiplier uses
-1x through 0x to +1x, matching the discussion row.
Neither represents
studio profit: marketing, exhibitor shares, and other costs are not included.
Missing values appear as dashes, and a missing or zero budget has no return multiplier.
The heat map shares the comparison page's palette: budget uses only white to
green, starting at white for `$0` and getting greener on a logarithmic scale up
to `$1bn`. Net and multiplier use return on budget, with red at
`-1x`, neutral at break-even, and green at `+1x` (clamped beyond those limits).

Choose the circular-arrow refresh button on the row to update a single movie. The membership-protected
`POST /api/theatres/:theatreId/box-office` endpoint accepts `{ movieId }`, rejects
movies outside that theatre, and reports failures without clearing saved data.
Successful refreshes update the shared client cache.

In a theatre, **Menu > Extra Settings > Refresh box office** checks every movie
in that theatre, including Watched, one at a time. The bottom drawer shows real
completion progress using the heat map's green. Dismiss it without stopping the
update; reopen it from the menu while running. Individual failures are counted
and other movies continue; lost access stops the batch. Keep the page open:
navigating away stops further requests. A finished run can be restarted from the
menu, including to backfill older nominations. Errors appear in the drawer.

This is an unofficial scraper of public pages and can break if Mojo changes its
site. It does not bypass login, paywalls, or anti-bot challenges. Check Box Office
Mojo's terms before using or redistributing its data.

## Client data caching

The home page, theatre pages, settings, and the theatre picker share an SWR cache
backed by `localStorage`. Previously loaded content appears immediately after
revisiting or reloading while SWR refreshes it in the background. It also
refreshes on navigation, window focus, and reconnect. This is not offline
storage: the app still needs the server to fetch current data.

`app/lib/data/` owns the provider, query hooks, loading/error boundary, and theatre
actions. Components use these hooks and the existing API client, not SWR cache
keys or invalidation calls. The provider survives navigation and creates a new
cache on login, logout, or a session change. Access-denied responses hide cached
content; temporary refresh failures retain it with an error and retry control.
The saved cache is namespaced by user ID and stores only successful query data.

Successful API writes refresh the shared theatre queries automatically. This is
deliberately broad: watched status and membership changes can affect multiple
theatres. Reads are deduplicated, and inactive queries refresh on their next mount.
New reads belong in `app/lib/data/queries.ts`; writes should keep using
`app/lib/api.ts` so cache invalidation stays centralized.

Theatre HTML is a data-free shell; the existing authenticated API routes enforce
membership for every read and write. The service worker caches assets, but
authenticated API responses and page navigations use the network, leaving SWR
as the only cache for private data.

## Local development

1. Install [Node.js](https://nodejs.org/), copy `.env.example` to `.env.local`, and set `DATABASE_URL` to a Neon connection string.
2. Install dependencies: `npm install`
3. Apply the schema: `npm run db:migrate`
4. Start the app: `npm run dev`
5. Open <http://localhost:3030>.

Dev mode turns off the service worker so the browser never serves stale code.
That means push notifications only work in a production build
(`npm run build && npm start`). If you still see stale code, run `npm run dev:clean`.

Useful checks are `npm test`, `npm run typecheck` and `npm run build`. To create a
new Drizzle migration after changing `src/db/schema.ts`, run `npm run db:generate`.

### Refreshing dev and the browser test account

Run `npm run dev:sync` to **replace the dev Neon branch's schema and data with
the latest production state**, apply local migrations, and recreate the browser
test account. Dev-only data and schema changes are discarded; production is not
modified. Restart any running dev server afterward and sign in again.

This helper requires Node.js 24 or newer. The command is pinned to this project's
existing `dev` and `production` branch IDs. Before any writes, it verifies their
relationship and that `.env.local`'s
`DATABASE_URL` matches dev, including credentials. It refuses to run on Vercel
or with `NODE_ENV=production`. Run `npm run neon:dev` first if your local
environment is targeting another branch. The Neon CLI must be authenticated.
Use `npm run dev:sync -- --dry-run` to check the target without changing anything.

The first run generates a unique password in git-ignored `.dev-user.json`
(readable only by your local user). Later runs reuse that file. The account uses
normal Better Auth sign-in, owns a Watchlist, and is an admin of copied **shared**
theatres so browser testing can exercise admin controls. It does not join other
users' personal Watchlists. There is no production login bypass or special
sign-in logic; the account is created only in dev.

After refreshing dev through the Neon UI, use `npm run dev:seed` to reapply
migrations and restore the account without resetting the branch. This is also
safe to rerun: it preserves the existing user and Watchlist. If an existing
account's password doesn't match the local file, the command fails rather than
overwriting its credentials. Keep `.dev-user.json` out of commits, logs, and
agent memories; agents can discover its location through `AGENTS.md`.

## CSS

`app/globals.css` owns the light-theme tokens, reset, focus ring, and intentional
global utilities (`avatar` and `srOnly`). Component and page styles belong in
their colocated CSS Modules. Shared standalone form pages use
`app/components/FormPage.module.css`.

Use semantic color tokens: `--page` for the beige canvas, `--surface` for cards,
`--on-dark` for light foregrounds, and the danger/success tokens for feedback.
Use `--radius-pill` for pill shapes. Keep one base rule per selector and place
responsive and reduced-motion overrides after it. Merge exact local duplicates
rather than introducing a universal button abstraction.

CSS Module classes only match elements in that module; use `:global(.avatar)`
when targeting the shared avatar utility. Inputs that suppress their own focus
outline must have a visible container focus treatment. Loading animations and
hover movement need targeted reduced-motion alternatives; `MotionProvider`
respects the system setting for Motion transforms, while height/width animations
use `useReducedMotion` to change immediately.

Run `npm run lint:css` to catch invalid CSS and duplicate rules/declarations.
It excludes the ignored Letterboxd prototype. CSS changes also need browser
checks at narrow and wide widths, enlarged text, keyboard focus, and reduced
motion; the DOM tests cannot verify layout or the rendered cascade.
Component tests load real CSS Module exports to catch missing class references,
and `app/styles.test.ts` checks shared foreground/background contrast thresholds.

## GitHub Codespaces

This repository includes a devcontainer for Codespaces. Before creating a
Codespace, add the personal Codespaces secret `SHORTLIST_ENV_BUNDLE` with
repository access to this repository.

The GitHub Copilot CLI is installed automatically by the devcontainer. Run
`copilot` and use `/login` the first time you launch it.

After filling in `.env.local`, run this from the repository root. It requires
the GitHub CLI to be installed and authenticated:

```sh
./.devcontainer/env-bundle.sh encode
```

The command updates `SHORTLIST_ENV_BUNDLE` and restricts it to the current
repository. Use `--repo OWNER/REPO` to target a different repository. On first
Codespace creation, the devcontainer runs `npm ci` and decodes the bundle to
`.env.local`. Then run:

```sh
npm run db:migrate
npm run dev
```

Open the forwarded port 3030 preview. If sign-in redirects fail, add the
Codespace preview domain (`https://<codespace-name>-3030.app.github.dev`) to
Neon Auth's trusted domains.

## Tests

`npm test` runs Vitest. The API tests execute the real route handlers against an
in-process Postgres ([PGlite](https://pglite.dev)), so cross-theatre isolation is
proven against actual SQL rather than a mock: `app/api/isolation.test.ts` asserts
per route that a member of one theatre cannot read or mutate another's content, so a
missing `theatreId` predicate fails the suite.

## GitHub and Vercel

Push this directory to a new GitHub repository. In Vercel, choose **Add New Project**, import that repository, and keep the detected Next.js settings. Add `DATABASE_URL` under the project's Environment Variables for the environments you use.

Production deployments use the build command in `vercel.json` to apply pending
Drizzle migrations before building the app. A migration failure stops the build.
Set Vercel's Production `DATABASE_URL` to the production database; the migration
step reads that environment variable directly and does not load `.env.local` or
switch Neon branches. Preview builds skip migrations. For schema changes,
generate and review the migration before pushing.
