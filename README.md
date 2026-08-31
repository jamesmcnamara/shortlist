# Movie Shortlist

A tiny Next.js + Vercel + Neon app for deciding what to watch, built on Drizzle ORM.

## Rooms

All content lives in a **room**, and every nomination, vote, comment and watched
marking is scoped to one. Members only ever see the rooms they belong to; rooms
are joined through a shareable invite link.

A room is not a fixed "type" — it is a set of knobs that an admin can change at
`/r/<slug>/settings`:

| Knob                  | Meaning                                                               |
| --------------------- | --------------------------------------------------------------------- |
| Nominations per cycle | How many movies each person may add. Unlimited when unset.            |
| Votes per cycle       | How many votes each person gets. Several may be stacked on one movie. |
| Reset                 | Whether the cycle turns over monthly, weekly, or never.               |
| Self-voting           | Whether people may vote for their own picks.                          |
| Duplicates            | Whether the same movie may be added twice.                            |

Two presets are offered when creating a room, and both are just starting values
for the knobs above:

- **Movie club** — one nomination each per month, then everyone votes.
- **Watch list** — add as many movies as you like, with votes deciding what rises.

"Reset: never" collapses the cycle to a single always-open period, which is what
gives a watch list its running, non-resetting behaviour.

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
