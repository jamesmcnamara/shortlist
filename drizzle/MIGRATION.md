# Manual migration: single club → rooms

The schema in `src/db/schema.ts` is the target state. This file records the
transformation required to get an existing database there. It is intentionally
**not** wired into `npm run db:migrate` — run it yourself, against a backup.

Generate the real DDL with `npm run db:generate` and reconcile it against the
data steps below; the ordering here is what matters.

> **Warning:** the generated DDL now lives in the migration folder as
> `0008_previous_zeigeist.sql`, so `db:migrate` *will* attempt it. It only
> succeeds against an empty `movies` table — `ALTER TABLE "movies" ADD COLUMN
> "details" jsonb NOT NULL` fails on any existing row. Worse, the neon-http
> driver runs each statement outside a transaction, so a failure leaves the
> schema half-applied. Against a database with data, perform the steps below by
> hand instead.

## 1. New tables

Create `rooms` and `room_members` as defined in the schema.

## 2. Seed the existing club as a room

All current content belongs to one implicit club. Give it a room, and set
`created_at` to the epoch the existing `month` values were computed from so the
carried-over cycle numbers stay meaningful.

```sql
insert into rooms (
  slug, name, created_by, invite_code,
  nominations_per_cycle, votes_per_cycle, cycle_length,
  allow_self_vote, allow_duplicate_nominations, created_at
)
values (
  'movie-club', 'Movie Club', '<owner-user-id>', '<random-code>',
  1, 5, 'month',
  false, false, '<epoch matching existing month values>'
);
```

Any slug works; existing members reach it through the room switcher. Users who
belong to no rooms are sent to `/rooms/new` rather than to a default slug.

## 3. Backfill membership

Everyone who ever participated becomes a member, and the owner an admin.

```sql
insert into room_members (room_id, user_id, role)
select r.id, u.user_id, case when u.user_id = '<owner-user-id>' then 'admin' else 'member' end
from rooms r
cross join (
  select user_id from nominations
  union select user_id from votes
  union select user_id from nomcoms
  union select user_id from seen
) u
where r.slug = 'movie-club'
on conflict do nothing;
```

## 4. Scope existing content

Add `room_id` to `nominations`, `votes`, `nomcoms` and `seen`, backfill each to
the seeded room, then set `not null`.

## 5. Carry cycles across

Rename `month` to `cycle` on `nominations` and `votes`. Because step 2 aligned
the room's epoch, the existing values transfer unchanged — no arithmetic.

If you did not align the epoch, rewrite instead:
`cycle = month - (min(month) over ())`.

## 6. Collapse `seen` to room level

`seen` changes meaning from "I have seen this" to "this room watched this", so
per-user rows collapse to distinct `(room_id, movie_id)`. Keep the earliest
marking for attribution.

```sql
-- Add marked_by, then deduplicate.
delete from seen s
using seen keep
where s.room_id = keep.room_id
  and s.movie_id = keep.movie_id
  and s.id > keep.id;
```

Then drop `seen.user_id` and add the unique index on `(room_id, movie_id)`.

## 7. Indexes

Add those defined in the schema. Note there is deliberately **no** unique
constraint on `votes` — stacking several votes on one nomination is a supported
behaviour, and the `(room_id, user_id, cycle)` index exists to serve budget
counting.
