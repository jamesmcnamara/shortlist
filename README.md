# Movie Shortlist

A tiny Next.js + Vercel + Neon app for deciding what to watch, built on Drizzle ORM.

## Theatres

All content lives in a **theatre**, which is a shared watch list. Every list,
including personal Watchlists, is public: anyone can open a list without signing
in or joining. Clicking a nominator's name or a comment avatar opens
`/u/@<handle>`, showing the theatres that person belongs to. **My Theatres**
opens your own page; there is no global theatre directory. Movies, recommendation
notes,
discussion comments, and the names of people who marked a movie seen are
visible to everyone, as are list creator and Watchlist owner IDs. Email addresses,
member rosters, invite codes, and
notification settings are not part of public list pages.

Theatre URLs are `/u/@<creator-handle>/<theatre-slug>`, including Watchlists.
Slugs come from the original theatre name; duplicates under the same creator
get a numeric suffix. Renaming a theatre keeps its URL. User handles are chosen
at sign-up and can be changed directly in the database; existing users get handles generated from
their display names, with numeric suffixes for duplicates. Handles use 3-30
lowercase letters, numbers, or hyphens, starting and ending with a letter or
number. No email addresses are used to generate public handles.
Only handle-based profile and theatre URLs are supported. Old `/u/<user-id>`,
`/theatres/<theatre-id>`, `/theatres`, `/rooms/...`, and `/api/rooms/...` links
no longer work. Old notification destinations return to Search instead of
opening a removed route. API routes continue using theatre IDs, theatre creation
remains at `/theatres/new`, and `/join/<code>` invite links are unchanged.

Movies have public detail pages at `/m/<movie-id>` (the stored movie ID, not
the TMDB ID). Selecting a Search result updates the URL without reloading or
discarding the search. Back and Forward restore the search or selected movie;
refreshing or sharing the movie URL loads its standalone detail page.

Apply migration `0028_rare_lady_bullseye.sql` before deploying these routes.
It backfills handles and theatre slugs without changing names, memberships,
invite links, or movie data. Auth tables are excluded from Drizzle generation,
so this migration also explicitly adds the username plugin's columns and constraints.

Username redirects are managed directly in the `redirects` table, with no UI.
Apply migration `0031_sparkling_blob.sql` before deploying this feature, then add
lowercase handles without the `@` prefix:

```sql
INSERT INTO redirects (from_handle, to_handle) VALUES ('old-handle', 'current-handle');
```

If a profile or theatre URL would be a 404, the app looks up its handle and
tries the mapped handle once. It redirects only if that replacement profile or
theatre exists, preserving the theatre slug, settings suffix, and query string.
Existing URLs take precedence. Missing targets and redirect chains still return
404; mappings do not change accounts, permissions, or theatre ownership.

Apply migration `0032_allow_handle_changes.sql` to allow username updates.
The database still normalizes handles, enforces their format and uniqueness,
and synchronizes `displayUsername` when `username` is updated. Changing a
handle changes that user's profile and creator-based theatre URLs; add a
redirect from the old handle to the new one manually to keep old links working.
No account-editing UI or automatic redirect creation is added.

Members can nominate movies and remove their own nominations from any list,
including watched nominations. Admins can also remove anyone's nominations,
import titles, mark entries completed, rename or delete the list, and manage its
members and invite links.
Recommendation notes can only be changed by their original nominator, who must
also be an admin of that list. Any signed-in user can add discussion comments,
edit their own discussion comments, mark movies seen, and refresh shared
streaming or box-office metadata without joining. These personal actions do
not create membership.

The **Share** menu item copies the public list URL. Opening it never joins a
viewer. `/join/<code>` invite links remain separate: a valid code still opens a
read-only preview while signed out; anyone signed in who opens a member link
joins as a member, while an admin link grants admin access. Existing members
can still share member links; only admins can access admin links or rotate
either kind. Rotating an invite revokes preview and joining through its old
code, but does not affect public viewing through the list URL or remove existing
members.

Marking a movie seen, using bulk **Mark watched**, or moving a movie into
**Watched** triggers a bold confetti celebration immediately, while the save
runs in the background. Save failures still show an error.
Undoing a watched marking or bulk-marking movies already seen does not celebrate.
The animation respects the system's reduced-motion preference.

Movie discussions open from the bottom. Scrolling moves the whole panel upward
to fill the screen, with its content attached rather than scrolling inside a
capped-height panel. Clicking above the panel or using its close button dismisses
the discussion.

The separate `/share/...` links have been removed and no longer work. Deploy
the updated app before applying migration `0024_sticky_stardust.sql`, which
drops the unused `theatres.share_code` column. Existing invite links and
memberships are preserved.

### Descriptions and tags

Admins can edit a list's description above its search controls. Descriptions
are public, including in signed-out invite previews. Save keeps hashtags in the
text and synchronizes the list's stored tags; Cancel leaves both unchanged.
Removing a hashtag removes that list's association. Clearing the description
removes all its associations, without changing other lists.

Tags are case-insensitive: `#SciFi` and `#scifi` are the same tag. They allow
Unicode letters and numbers, underscores, and hyphens, including `#2026`,
`#sci-fi`, and `#date_night`. Start a hashtag at the beginning of the text or
after whitespace or opening punctuation (parentheses, brackets, braces, or
quotes). Spaces and other punctuation end a tag. Bare `#`, Markdown headings
such as `# Heading`, URL fragments, and hashes embedded in words are not tags.
Descriptions remain plain text, not Markdown. Recognized hashtags appear in
blue when displayed, without links or chips; the editor stays plain text.
Some tags also turn on [theatre extensions](#theatre-extensions), like
[movie suggestions](#movie-suggestions) for `#specific` and a
[movie club](#movie-club) for `#movieclub`.

The canonical tag text (without `#`, normalized to Unicode NFC and lowercase)
is its immutable primary key. The shared `tags` dictionary is insert-only in
the application, and `theatre_tags` holds each list's associations with indexes
in both directions for later filtering. Changing a hashtag changes associations,
never renames a shared tag. Unused dictionary entries are retained.

Apply migration `0025_petite_colossus.sql` before deploying this feature.
Existing descriptions are preserved and get their tags extracted on their next
save, or by the backfill below.
Autocomplete and nomination tagging are not implemented yet.

### Default movie sort

Admins can choose a **Default sort** in theatre settings from the same options
as the list's sort menu, including sorts supplied by enabled extensions.
**App default** stores `null` in `theatres.default_sort` and uses Recently added.
The saved default applies to public and member views unless the URL specifies
another available sort. If a saved extension sort becomes unavailable, the list
falls back to Recently added.

Apply migration `0033_theatre_default_sort.sql` before deploying this feature.

### Fantasy lists

A list whose description has the `#fantasy` tag (a whole tag, so
`#fantasyfootball` doesn't count) shows a dashboard below its movies. Each
person's score is the sum of box office net (worldwide gross minus budget) of
the movies they nominated. Flops subtract, and movies without numbers yet count
$0 and are flagged. It shows the standings, where the lead comes from, the
season race over release dates, every movie ranked, and what's still to come.
Tapping a movie highlights it across all of them. It's built from data the
movies already have, so nothing needs saving. The charts use visx and `motion`,
load only for fantasy lists, and respect reduced motion.

### Finding theatres

Each user's theatre page has title search, sorting, and tag filters below the
heading. Search matches list titles without regard to case. Sort alphabetically
(A-Z), by creation date (newest first), or by update date (newest first, the
default). Selecting multiple tags requires every selected tag; search and tags
combine. The URL preserves the view when refreshing or sharing it. Blue tag
chips below each card's posters show the list's tags; they are labels, not
separate filter buttons.

A list is updated when its title or description changes, or a movie is added or
removed, including imports. No-op saves, duplicate imports, discussion,
seen/completed changes, membership changes, and invite rotation do not change
this date. Database triggers maintain it atomically with each change.
Historical update dates start from list creation or its latest movie addition;
past edits and removals cannot be reconstructed.

Apply migration `0026_rainy_jetstream.sql`, then backfill existing description
tags before deploying the directory controls. With Node 24 and the intended
database configured, preview the backfill with
`node --env-file=.env.local scripts/backfill-theatre-tags.mjs`, then add
`--apply` to run it. Verify the target database first. This idempotent operation
uses the same hashtag parser as description saves, preserves descriptions and
update dates, and skips descriptions changed concurrently since its initial
read. A normal concurrent description save already synchronizes its own tags.

### Bulk movie import

Choose **Menu > Extra Settings > Import Movies** to open the import panel below
Watched. Use **Close** in the panel to dismiss it. Paste one movie
title per line, then start the import. Each title uses the first TMDB search match without a review
step; the results show the matched movie and year so you can spot incorrect
matches and remove them from the list. Each title can be up to 300 characters.

Movies are added one at a time under your name, with no note. Blank lines and
repeated titles are ignored. Movies already on the list (including Watched) are
skipped without changing their notes or status. Missing matches and failures are
reported separately, and other titles continue importing. **Stop** finishes the
current movie before pausing; use **Continue import** for remaining titles or
**Retry failed titles** for errors.
Keep the panel and page open while importing; closing the panel or navigating
away stops further requests but does not undo movies already added.

### Movie notifications

List members can toggle movie notifications using the small grey bell beside
the theatre title. Notifications are off by default: an outlined bell means off,
and a filled bell means on. Enabling them requests browser permission and
registers the current device; the list preference applies to all devices you
have enabled. On another device, choose **Enable on this device** below the title
for a list you already follow. Turning off the bell stops alerts for that list
on all your devices. Signing out disconnects the current browser.

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

### Wikipedia articles

New movies resolve an English Wikipedia article through Wikidata, matching the
TMDB movie ID first and falling back to the IMDb ID when no TMDB item exists.
Only a unique matching item with an English article is linked; missing or
ambiguous matches have no icon. The URL is stored in `movie.details.wikipediaUrl`
and shown beside ratings in search details, nominations, and movie discussions.
No API key or database migration is needed.

Lookups have a four-second total timeout. Service failures are logged without
blocking movie creation. Cached movies are not looked up again, so existing
movies can be backfilled using **Menu > Extra Settings > Refresh Wikipedia**.
This checks every movie in the current theatre, including Watched, one at a
time using the same progress drawer as the box-office refresh. Dismissing the
drawer does not stop the job; reopen it from the menu to see progress. Keep the
page open, since navigating away stops further requests. Individual failures
are counted and other movies continue; lost access stops the batch. Restart
from the menu to retry.

Any signed-in user can run the refresh on a public theatre without joining.
Successful lookups update the shared client cache and only replace the stored
Wikipedia URL. A missing or ambiguous article stores `null`; lookup failures
preserve the previous URL and appear in the progress drawer.

The stored article is also the last source for a movie's production budget when
Box Office Mojo and TMDB have none; see
[Box Office Mojo financial data](#box-office-mojo-financial-data).

### Command-line movie refresh

The scripts in `refresh/` refresh Wikipedia articles or box-office data for one
theatre or all theatres, including Watched. They run directly against the database; no running
app, browser login, or additional API key is needed. The existing menu buttons
remain available.

With Node 24 and dependencies installed, preview the selected movies:

```sh
npm run refresh:wikipedia -- <theatre-id>
npm run refresh:box-office -- <theatre-id>
```

Use the UUID from the theatre's URL. Node loads `.env.local` through the npm
commands' `--env-file` option. Configure the database manually before running;
the scripts never switch branches or change environment files. An exported
`DATABASE_URL` takes precedence over the file, so check that too before adding
`--apply`:

```sh
npm run refresh:wikipedia -- <theatre-id> --apply
npm run refresh:box-office -- <theatre-id> --apply
```

Omit the theatre ID to refresh movies across all theatres. Shared movies are
processed only once, and cached movies that are not on any theatre are excluded:

```sh
npm run refresh:wikipedia -- --apply
npm run refresh:box-office -- --apply
```

Movies are refreshed once each, sequentially, using the same lookup and update
logic as the menu buttons. Only the relevant metadata key is replaced; other
metadata and nominations are preserved. Movie metadata is shared, so refreshed
values also appear in other theatres containing the same movie.

Each movie's result and a final summary are printed. Missing required IDs,
removed nominations, and lookup failures are reported without stopping other
movies; any failure gives exit code 1. Lookup failures preserve existing values,
while a successful Wikipedia lookup with no unique article stores `null`.
Rerun to retry, or press Ctrl+C to stop; completed updates are not rolled back.
The preview does not fetch external data or write to the database.

New refresh entry points can import their refresh function normally and call
`runCli(refreshFunction)` from `refresh/cli.ts`. Commander handles arguments,
`--help`, and usage errors; the CLI runs the refresh and reports failures through
its exit code.

### Importing Oscar movies

`npm run refresh:oscars` previews every IMDb-keyed movie in
`public/data/oscars.json`, including movies that aren't on any theatre.
`npm run refresh:oscars -- --apply` adds missing movies to the shared database
and writes each movie's numeric `shortlistId` into the blob. It does not add
nominations to any theatre. Existing movies and their metadata are reused.
Both nomination routes and the Oscar importer call the backend `addMovie`
helper, which resolves the movie and runs add-time enrichment, including
Box Office Mojo. Changes to that shared pipeline apply to both flows.
Optional enrichment failures are logged without discarding the imported movie,
matching normal adds. Reruns skip movies that already have Box Office Mojo data
and rerun the add pipeline for the rest, so they backfill failed enrichment.

Like the other refresh scripts, this uses the configured `DATABASE_URL` from
the environment or `.env.local` without switching database branches. Missing
movies are matched by IMDb ID through TMDB and imported with the normal
metadata provider, so TMDB and MDBList credentials are required for imports.
The preview does not fetch external data or change the database or blob.

Failures are reported per movie, other movies continue, and any failure gives
exit code 1. Successful links are saved; failed movies have no `shortlistId`.
An MDBList HTTP `429` pauses the Oscar importer for five minutes, then retries
the same movie before continuing. Each further `429` starts another five-minute
wait; press Ctrl+C to stop. This handles the short-term request limit, but a
daily quota exhaustion may require waiting for the daily reset. Normal web
requests do not wait or retry this way.
Rerunning reuses completed imports and retries missing movies. IDs are always
resolved against the configured database rather than trusted from a previous
run, so the resulting blob belongs to that database. `npm run data:oscars`
updates the Oscar awards from the source dataset while preserving existing
Shortlist IDs; run `refresh:oscars -- --apply` afterward to import new movies.

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
No additional API key is needed.

Financial data lives in the typed `movies.box_office` JSONB column, keyed by
source: `boxofficemojo` holds the scraper's figures, `tmdb` and `wikipedia` hold
their budgets, and `manual` holds `{ budget }`. Writers replace their source
entries with a shallow JSONB merge; no merged financial blob is stored.
`resolveBoxOffice` is a pure helper that resolves these snapshots into
`movie.details.boxOffice` at the shared movie-read boundary, so discussions,
standings, and comparisons use the same figures.

Budget precedence is manual, Mojo (an explicit zero counts), positive
whole-dollar TMDB budget, then Wikipedia. `budgetSource` identifies the winning
source and is absent when no budget is available. Grosses, source URL, and fetch
time come only from Mojo. Its scraper reads the **All Releases** summary,
including re-releases, not an individual release's totals. Missing amounts are
`null`, not zero. A failed Mojo scrape does not overwrite saved snapshots.
Mojo sometimes redirects older films to their own `/credits/` page. The scraper
allows that single redirect and reads the same lifetime summary there, even
when all figures are missing. Other redirect destinations and chains are rejected.
TMDB's `budget` and `revenue` are unchanged. Movie metadata is shared across
theatres.

Migration `0030_flimsy_hitman.sql` adds the column, moves existing figures to
their source entries using budget provenance, and removes `details.boxOffice`
from stored metadata. Apply it with `npm run db:migrate` against the intended
database when deploying this change; pause financial writes during the
old-code/new-code transition so old writers do not recreate the legacy key.

On fantasy lists, signed-in visitors can use **Add budget** in **Missing numbers**
for movies without a budget. The inline form accepts a nonnegative whole-dollar
USD amount and saves it through `PATCH /api/theatres/:theatreId/box-office`.
Manual budgets survive subsequent box-office refreshes, which update only
automatic sources. The API allows replacing a manual budget even when an
automatic budget exists; there is no stale-form or historical-write guard.
Saving preserves other movie metadata and
grosses, and revalidates the list so standings update immediately. If no Mojo
data exists yet, only the manual budget is stored. The resolved UI figures have
null grosses and no fabricated fetch time; the movie remains unscored until
worldwide gross is available.

The Wikipedia fallback only runs when `movie.details.wikipediaUrl` is set. It
reads the article's lead section from the MediaWiki API (five-second timeout)
and takes the infobox's **Budget** row. Only the budget is used; the article's
box office row is ignored. The parser is strict and prefers no budget to a
wrong one:

- The first US-dollar amount wins. A foreign figure with a dollar conversion,
  like `₩13.5 billion (US$11.4 million)`, uses the dollars. A cell with only
  another currency (€, ₹, A$) gives no budget.
- A range like `$14–25 million` uses its midpoint.
- Bounds (`over`, `at least`, `$20 million+`), "equivalent to" inflation figures,
  units it doesn't know (`$20M`), amounts under $1,000, and a missing or
  duplicated Budget row all give no budget.

If Wikipedia fails (an HTTP error, a timeout, or an unexpected response), the
error is logged and Mojo's figures are still saved with a null Wikipedia budget.
No historical Wikipedia budget is preserved. An article that loads without a
usable budget also gives `null`.

The Numbers isn't used: its API is paid and its terms ban scraping. There is no
LLM fallback either. In a sample of Oscar films, every infobox with a USD Budget
row parsed, and the rest had no budget row for an LLM to read.

Missing IMDb IDs are logged and skipped. HTTP errors, timeouts, blocked pages,
and unexpected markup are logged without preventing the nomination. Failed
Mojo lookups leave any previously saved figures untouched. There is no scheduled
refresh or automatic retry; `fetchedAt` is when the page was read, not when Mojo
last updated its numbers. Since a new nomination waits for the lookup, the worst
case is Mojo's ten seconds plus Wikipedia's five.

Movie discussions show a compact financial sentence: "Made $15.9m (1.59x) on $10m"
or "Lost $5m (-0.5x) on $10m", with inline colors on the figures. Unknown returns
use a neutral "Net" label instead. When the budget came from TMDB or Wikipedia
rather than Mojo, the tooltip and screen-reader text say so. Dollar amounts are
rounded down to three significant digits (for example, `$15.9m` or `$100k`).
Net is worldwide gross minus
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

Theatre HTML is a data-free shell. User theatre pages and individual list reads
are available without a session; list curation routes require admin membership, while personal
comments, seen marks, and metadata refreshes require sign-in but not membership.
The service worker caches assets, but API responses and page navigations use
the network, leaving SWR as the only data cache.

## LLM requests

Server code can ask an LLM for structured data with `generate` from
`app/lib/llm.ts`. It takes a Zod schema and returns a validated object:

```ts
const { movies } = await generate(
  z.object({ movies: z.array(z.object({ title: z.string() })).max(5) }),
  {
    instructions: "Suggest up to five movies that fit the description.",
    prompt: theatre.description,
  },
);
```

Requests go through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
using the [AI SDK](https://ai-sdk.dev). The default is
[`google/gemini-2.5-flash-lite`](https://vercel.com/ai-gateway/models/gemini-2.5-flash-lite),
set by `MODEL` in `llm.ts`. On November 4, 2026, Vercel's
[live catalog](https://ai-gateway.vercel.sh/v1/models) confirmed its availability
and structured-output support, and the
[Free Tier catalog](https://vercel.com/ai-gateway/models?freeTier=true) explicitly
marked it `availableToFreeTier: true`. Gemini 3.8 Flash was available but not
free-credit eligible. Flash-Lite's listed rates are $0.10 per million input tokens
and $0.40 per million output tokens: 2,000 input + 500 output tokens cost $0.0004.
Availability, eligibility, and prices can change; recheck them when changing `MODEL`.

Teams that have not purchased AI Gateway credits receive $5 of credit every
30 days for eligible models. To stay free, do not buy credits or enable auto
top-up; calls fail when the allowance runs out. Buying credits ends the recurring
free allowance. Free-tier requests are also rate limited (`429`).
See [Gateway pricing](https://vercel.com/docs/ai-gateway/pricing).

On Vercel, the SDK uses the deployment's
[OIDC token](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc)
automatically. Project OIDC settings are under **Settings > Security > Secure
backend access with OIDC federation**. Do not set `AI_GATEWAY_API_KEY` there:
it takes priority over OIDC.
For local development, create a key under **AI Gateway > API Keys** in the
Vercel dashboard, give it a budget, and set `AI_GATEWAY_API_KEY` in `.env.local`.
An API-key budget covers only that key, not deployed OIDC requests; use a
team or project [budget](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets)
to limit those too. Budgets are soft caps checked before each request, not
guaranteed exact spending limits.

`generate` throws on network, auth, quota, or rate-limit errors, after 30 seconds,
or when the response doesn't match the schema. It retries a retryable failure
once and caps each response at 8,000 output tokens. Callers must handle failures
explicitly and fall back without the result where appropriate.

Put untrusted text, such as theatre descriptions or Wikipedia pages, only in
`prompt`, never in `instructions`. Treat the output as untrusted too: it is
schema-checked but can still be wrong or influenced by that text. The model gets
no tools, and the app doesn't log prompts. Only call `generate` from server code.
Check Vercel's and Google's data retention terms before sending anything private.

## Theatre extensions

Extensions are opt-in list behaviors kept out of the core app. Each one is named
after the hashtag that turns it on, so `#specific` turns on `specific`, though
an extension can list other hashtags too (`#movie-club` also turns on
`movieclub`). They're listed in `app/lib/extensions/index.ts`, which is safe to
import in the browser, and each one's server code lives in
`app/lib/extensions/<name>/`.

They share one route, `POST /api/theatres/:theatreId/extensions/:name`, which
runs the handler registered in `app/lib/extensions/server.ts`. Before calling
it, the route answers `404` for unknown extensions, runs the usual theatre
access checks (each handler says whether members or only admins can call it),
and answers `400` when the list doesn't have the extension's tag. A handler
that needs several actions can switch on its request body.

An extension that has to change the core nominations routes does it through
`hooks` on its handler, so those routes never name an extension. Hooks only run
on lists that have the extension's tag, and each one is optional:

- `beforeNominate({ theatre, userId })` returns the reason this user can't
  nominate right now, or `null`. `POST /nominations` answers `409` with it.
- `decorate(theatre, nominations)` adds the extension's data to the nominations
  a list shows, under `nomination.extensions[name]`.

Their state lives in `theatres.extensions`, one JSON object keyed by extension
name, like `{ "specific": { "suggestedAt": "…" } }`. Read an extension's object
with `extensionData(name)` (always an object, `{}` if there's nothing usable)
and write it only with `mergeExtensionData(name, patch)`, both in
`app/lib/extensions/data.ts`. The merge happens in SQL and touches only that
extension's key, so concurrent writes don't overwrite each other. The blob
itself never leaves the server: `SafeTheatre` omits it and client queries don't
select it, so send anything the client needs through `decorate`. Don't add
columns or routes for an extension. Apply migration
`0029_theatre_extensions.sql` before deploying this feature.

### Movie suggestions

A list tagged `#specific` gets a **Suggestions** section where Watched normally
goes. Watched is hidden on those lists, so completed movies there stay out of
sight until the tag is removed. Admins press **Suggest** to ask the model for up
to five films that fit the description and aren't on the list yet. Each one is
looked up on TMDB by title and year (give or take one year), and anything TMDB
can't confirm is dropped. Tapping a suggestion opens the usual add form with the
model's reason filled in as the note, which you can edit first.

Suggestions only live in the page, so a refresh clears them. Pressing **Suggest**
again adds more, and the titles already offered are sent along so the model
doesn't repeat them. On these lists, everyone who isn't an admin, including
signed-out visitors, sees neither the section nor Watched.

`POST /api/theatres/:theatreId/extensions/specific` is admin-only and takes
`{ "exclude": string[] }` (up to 100 titles, 200 characters each). It returns
`{ suggestions }` shaped like nominations, with negative ids because nothing is
saved until someone adds one. On top of the extension checks above, it answers
`503` when TMDB credentials are missing, `429` inside a list's 10-second cooldown
(kept in `theatres.extensions.specific.suggestedAt`, and a failed model call
still uses it up), and `502` when the model call fails. It needs TMDB
credentials as well as the AI Gateway setup above.

### Movie club

A list tagged `#movieclub` (or `#movie-club`) runs like a monthly club. Every
member gets one nomination and five votes a month, and the month rolls over at
midnight Pacific time on the 1st. Members can add their own nomination and
remove it again, and admins keep everything they can do on any list. You can't
vote for your own nomination, and votes start fresh each month. You can spend
several votes on one movie, up to your five-vote monthly budget. Each movie card
shows a compact voting widget, and a centered "{n} votes left" bubble in the
Shortlist header shows your remaining votes.
The sort menu gets **Most upvotes**. Signed-out and read-only viewers see the
counts but can't vote.

The **+** and **−** controls add or remove one vote at a time. The number between
them counts everyone's votes, with "{n} from you" below it when you're signed
in. Voter avatars are in the movie's discussion, alongside its nomination
details. Each voter appears once, with a badge when they've given the movie
multiple votes.

Voting and removing a vote update the count, avatars, votes remaining, and sort
order immediately. Voting is disabled while the save is pending. A failed save
rolls the change back and shows an error; the list refreshes from the server
afterward.

A second nomination in the same month is refused with "You can only nominate one
per month, remove _title_." The limit isn't kept in the extension's state. It
counts the user's open (not yet watched) nominations created this month, so
removing the movie or marking it watched frees the slot. Bulk import isn't
limited.

Votes live in `theatres.extensions.movieclub` as `{ cycle, votes }`. `cycle` is
the month, like `"2026-03"`, and `votes` maps each user id to the nomination ids
they voted for, with one entry per vote (including repeated ids). Votes from an
earlier month are ignored, and the first vote of a
new month starts everyone over. Votes for movies that were removed or watched are
given back. Each nomination a list shows carries its voters in
`nomination.extensions.movieclub.voters`, with one person entry per vote.

`POST /api/theatres/:theatreId/extensions/movieclub` is open to any member and
takes `{ "action": "vote" | "unvote", "nominationId": number }`. It returns
`{ votesLeft }`. On top of the extension checks above, it answers `404` when the
nomination is gone, `400` for your own nomination, and `409` when you're out of
votes. Every `"vote"` spends one vote, and `"unvote"` returns one vote (or does
nothing if you have no votes on that movie).

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

The package uses ES modules (`"type": "module"`), including the TypeScript refresh
commands run through `tsx`. Use ESM imports in scripts; files that specifically
need CommonJS must use the `.cjs` extension.

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

### Speed Insights

The root layout mounts `SpeedInsights` from `@vercel/speed-insights/next` once
for all pages, including automatic route tracking. Enable **Speed Insights** in
the Vercel project dashboard, then redeploy and visit the app to begin collecting
Core Web Vitals. Local development logs debug events instead of reporting
production metrics. No API key or extra environment variables are required.

### Build and migrations

Every Vercel build first runs `npm run db:check`, which generates Drizzle
migrations and fails if anything in `drizzle/` is added, changed, or removed.
Generation errors and unresolved rename prompts also fail the build. This
compares files before and after generation rather than relying on a `.git`
directory being available on Vercel. For schema changes, run `npm run db:generate`
locally, review the SQL, and commit the migration, snapshot, and journal before
pushing.

After that check, production deployments apply pending migrations before
building the app. A migration failure stops the build and deployment. Set
Vercel's Production `DATABASE_URL` to the production database; the migration step
reads that environment variable directly and does not load `.env.local` or
switch Neon branches. Preview builds run the generation check but skip migrations.
Local `npm run build` remains database-independent.

Migrations run while the previous deployment is still serving requests, so keep
them compatible with the running version. For destructive changes, deploy the
compatible app change first and remove the old column in a later deployment.
