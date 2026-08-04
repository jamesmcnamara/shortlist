# Movie Shortlist

A tiny Next.js + Vercel + Neon starter. The `/api/movies` route reads and writes Neon Postgres through Drizzle ORM.

## Local development

1. Install [Node.js](https://nodejs.org/), copy `.env.example` to `.env.local`, and set `DATABASE_URL` to a Neon connection string.
2. Install dependencies: `npm install`
3. Apply the schema: `npm run db:migrate`
4. Start the app: `npm run dev`
5. Open <http://localhost:3000>.

Useful checks are `npm run typecheck` and `npm run build`. To create a new Drizzle migration after changing `src/db/schema.ts`, run `npm run db:generate`.

## GitHub and Vercel

Push this directory to a new GitHub repository. In Vercel, choose **Add New Project**, import that repository, and keep the detected Next.js settings. Add `DATABASE_URL` under the project's Environment Variables for the environments you use.

Run `npm run db:migrate` locally against the same Neon database before the first deployment. For subsequent schema changes, generate and review a migration, then run `npm run db:migrate` before or as part of your release process. Vercel only serves the app; database migrations are intentionally not run during a build.
