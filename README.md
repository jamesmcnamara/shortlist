# Movie Shortlist

A tiny Bun + Vercel + Neon starter. The browser UI is plain HTML and JavaScript; the `/api/movies` route reads and writes Neon Postgres through Drizzle ORM.

## Local development

1. Install [Bun](https://bun.sh), copy `.env.example` to `.env`, and set `DATABASE_URL` to a Neon connection string.
2. Install dependencies: `bun install`
3. Apply the schema: `bun run db:migrate`
4. Start the app: `bun run dev`
5. Open <http://localhost:3000>.

Useful checks are `bun run typecheck` and `bun run build`. To create a new Drizzle migration after changing `src/db/schema.ts`, run `bun run db:generate`.

## GitHub and Vercel

Push this directory to a new GitHub repository. In Vercel, choose **Add New Project**, import that repository, and keep the detected Bun build settings. Add `DATABASE_URL` under the project's Environment Variables for the environments you use.

Run `bun run db:migrate` locally against the same Neon database before the first deployment. For subsequent schema changes, generate and review a migration, then run `bun run db:migrate` before or as part of your release process. Vercel only serves the app; database migrations are intentionally not run during a build.
