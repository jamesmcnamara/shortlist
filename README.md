# Movie Shortlist

A tiny Next.js + Vercel + Neon app for deciding what to watch, built on Drizzle ORM.

## Rooms

All content lives in a **room**, which is a shared watch list. Every movie,
comment and watched marking is scoped to one. Members only ever see the rooms
they belong to; rooms are joined through a shareable invite link. Admins can
rename a room, manage its members and rotate its invite links from its settings
page.

## Client data caching

The home page, room pages, settings, and the room picker share an SWR cache
backed by `localStorage`. Previously loaded content appears immediately after
revisiting or reloading while SWR refreshes it in the background. It also
refreshes on navigation, window focus, and reconnect. This is not offline
storage: the app still needs the server to fetch current data.

`app/lib/data/` owns the provider, query hooks, loading/error boundary, and room
actions. Components use these hooks and the existing API client, not SWR cache
keys or invalidation calls. The provider survives navigation and creates a new
cache on login, logout, or a session change. Access-denied responses hide cached
content; temporary refresh failures retain it with an error and retry control.
The saved cache is namespaced by user ID and stores only successful query data.

Successful API writes refresh the shared room queries automatically. This is
deliberately broad: watched status and membership changes can affect multiple
rooms. Reads are deduplicated, and inactive queries refresh on their next mount.
New reads belong in `app/lib/data/queries.ts`; writes should keep using
`app/lib/api.ts` so cache invalidation stays centralized.

Room HTML is a data-free shell; the existing authenticated API routes enforce
membership for every read and write. The service worker caches assets, but
authenticated API responses and page navigations use the network, leaving SWR
as the only cache for private data.

## Local development

1. Install [Node.js](https://nodejs.org/), copy `.env.example` to `.env.local`, and set `DATABASE_URL` to a Neon connection string.
2. Install dependencies: `npm install`
3. Apply the schema: `npm run db:migrate`
4. Start the app: `npm run dev`
5. Open <http://localhost:3030>.

Useful checks are `npm test`, `npm run typecheck` and `npm run build`. To create a
new Drizzle migration after changing `src/db/schema.ts`, run `npm run db:generate`.

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
in-process Postgres ([PGlite](https://pglite.dev)), so cross-room isolation is
proven against actual SQL rather than a mock: `app/api/isolation.test.ts` asserts
per route that a member of one room cannot read or mutate another's content, so a
missing `roomId` predicate fails the suite.

## GitHub and Vercel

Push this directory to a new GitHub repository. In Vercel, choose **Add New Project**, import that repository, and keep the detected Next.js settings. Add `DATABASE_URL` under the project's Environment Variables for the environments you use.

Run `npm run db:migrate` locally against the same Neon database before the first deployment. For subsequent schema changes, generate and review a migration, then run `npm run db:migrate` before or as part of your release process. Vercel only serves the app; database migrations are intentionally not run during a build.
