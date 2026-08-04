# Neon cheat sheet

This project uses Neon Postgres, Drizzle ORM, Bun, and Vercel. The Neon CLI
uses the `.neon` file to remember the project and currently selected branch.
The file contains IDs, not secrets, and is safe to commit. Connection strings
are written to `.env.local`, which is ignored by Git.

## One-time setup

```bash
# Install or update the CLI
bun add -g neon

# Link this directory to a Neon project
neon link

# Check the current project and branch
neon status
neon branches list
```

If this project is already configured, the project ID and organization ID are
in `.neon`.

## Development and production

Use the default `production` branch for the deployed app. Create a separate
development branch so local experiments and test data cannot change
production:

```bash
# Create a long-lived development branch from production
neon branches create --name dev/<your-name> --parent production

# Select it locally and pull its DATABASE_URL into .env.local
neon checkout dev/<your-name>

# Confirm which branch is active
neon branches list
neon status
```

Switch between environments with `neon checkout`. Checkout pulls that
branch's environment variables automatically:

```bash
neon checkout dev/<your-name>  # local development
neon checkout production      # production operations
```

For a short-lived feature or preview branch:

```bash
neon branches create --name preview/<feature-name> --parent production
neon checkout preview/<feature-name>
```

Branches start with the parent's schema and data. Do not branch production
when production data must not be copied; use a schema-only branch or synthetic
data instead.

## Environment variables

Pull variables for the currently selected branch:

```bash
neon env pull
```

Pull a specific branch into a separate file:

```bash
neon env pull --branch production --file .env.production
```

Never commit `.env`, `.env.local`, `.env.production`, or any file containing a
connection string. In Vercel, configure `DATABASE_URL` separately for each
environment. Production should use the production branch; preview and local
development should use their own branches.

## Making and running migrations

1. Change the Drizzle schema in `src/db/schema.ts`.
2. Generate a migration:

   ```bash
   bun run db:generate
   ```

3. Review the new SQL file in `drizzle/`.
4. Apply it to the currently selected branch:

   ```bash
   bun --env-file=.env.local run db:migrate
   ```

The explicit `--env-file=.env.local` matters here because Drizzle reads
`DATABASE_URL` from `process.env`, while Neon writes the pulled values to
`.env.local`.

Apply a migration to development first, then promote it to production:

```bash
neon checkout dev/<your-name>
bun --env-file=.env.local run db:migrate

# Test the application, then migrate production
neon checkout production
bun --env-file=.env.local run db:migrate
```

Commit both the schema change and the generated SQL migration. Do not edit an
already-applied migration; create a new migration for the next change.

## Inspecting a database

Open an interactive SQL session:

```bash
neon psql dev/<your-name>
neon psql production
```

Run one query without opening an interactive session:

```bash
neon psql dev/<your-name> -- -c "SELECT current_database(), current_schema()"
```

Compare schemas between branches:

```bash
neon branches schema-diff production dev/<your-name>
```

Use `neon branches schema-diff --help` if you need the optional database or
project flags.

## Neon Auth

Check Auth status and refresh its environment variables:

```bash
neon neon-auth status
neon env pull
```

Auth is branch-aware. Use the Auth variables pulled for the same branch as the
app instead of copying production Auth URLs into a preview environment.

## Useful safety rules

- Check `neon status` before running a migration.
- Run and test migrations on a development or preview branch first.
- Treat production migrations as a release step and keep them backward
  compatible when deploying code and schema separately.
- Use `--no-env-pull` with `neon checkout` in CI if another system injects
  environment variables:

  ```bash
  neon checkout production --no-env-pull
  ```

- Delete temporary branches when finished:

  ```bash
  neon branches delete preview/<feature-name>
  ```

## Project commands

```bash
bun install
bun run dev
bun run typecheck
bun run build
bun run db:generate
bun --env-file=.env.local run db:migrate
```

Official references:

- <https://neon.com/docs/cli>
- <https://neon.com/docs/cli/branches>
- <https://neon.com/docs/cli/checkout>
- <https://neon.com/docs/cli/env>
- <https://neon.com/docs/get-started/workflow-primer>
