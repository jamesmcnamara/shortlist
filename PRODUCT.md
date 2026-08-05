# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small groups of friends curating a shared movie watchlist together.

## Product Purpose

Shortlist helps a friend group discover movies and maintain a shared shortlist of what to watch next. Future discussion and note-taking around movies are part of the intended product direction.

## Positioning

Shortlist is highly personalized for one friend group rather than designed as a general-purpose public movie community.

## Operating Context

Friends use the app together to search for movies and decide what belongs on their shared shortlist.

## Capabilities and Constraints

- TMDB-powered movie discovery and search.
- Shared shortlist management is the current scope.
- Movie discussion and notes are intended capabilities.
- The app is designed for a known group of friends; the access model is not yet established.

## Brand Commitments

The product should feel sleek, fun, and cool, with a sassy edge.

## Evidence on Hand

- Existing movie shortlist implementation: `app/page.tsx`
- TMDB integration: `app/api/tmdb/search/route.ts`
- Existing database-backed movie API: `app/api/movies/route.ts`

## Product Principles

- Make group curation quick and low-friction.
- Prioritize useful movie discovery over exhaustive catalog features.
- Keep the experience personal to the friend group.
- Leave room for conversation and notes without expanding beyond the shortlist workflow.
