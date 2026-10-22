---
name: Shortlist
description: A warm, restrained movie-club interface with confident typography and expressive artwork.
colors:
  primary: "#386d87"
  accent-light: "#8fbaca"
  accent-soft: "#bcd7e1"
  accent-wash: "#e3f0f4"
  page: "#f6f1e9"
  text: "#26262d"
  text-soft: "#555563"
  muted: "#666674"
  muted-soft: "#686875"
  border: "#e5e5eb"
  border-strong: "#d4d4df"
  surface: "#ffffff"
  surface-muted: "#eee9e1"
  success: "#266c58"
  success-wash: "#e9f4ef"
  danger: "#a02a2a"
  danger-wash: "#fbeeee"
  danger-border: "#e0b4b4"
typography:
  headline:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "2.2281rem"
    fontWeight: 700
    letterSpacing: "-0.07em"
  movie-title:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "1.5812rem"
    fontWeight: 700
    letterSpacing: "-0.03em"
  brand:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "1.0781rem"
    fontWeight: 800
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  synopsis:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "1.0156rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "0.8625rem"
    fontWeight: 700
  section-label:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "0.7906rem"
    fontWeight: 800
    letterSpacing: "0.05em"
  caption:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "0.7188rem"
    fontWeight: 400
rounded:
  menu-item: "0.5rem"
  control: "0.625rem"
  media: "0.75rem"
  panel: "0.875rem"
  search: "1rem"
  form-card: "1.125rem"
  sheet: "1.25rem"
  pill: "62.4375rem"
spacing:
  micro: "0.25rem"
  tight: "0.375rem"
  small: "0.5rem"
  compact: "0.625rem"
  medium: "0.75rem"
  base: "1rem"
  gutter: "1.25rem"
  section: "1.5rem"
  roomy: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0.6875rem 0.75rem"
  button-add:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "0.3125rem 0.8125rem"
  button-add-hover:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.primary}"
  filter:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.375rem 0.625rem"
  filter-active:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.primary}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
  search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.search}"
    padding: "0.875rem 1.125rem"
  menu-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.pill}"
    width: "2.375rem"
    height: "2.375rem"
  theatre-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "0.75rem 1rem"
  movie-poster:
    rounded: "{rounded.control}"
    width: "100%"
---

# Design System: Shortlist

## Overview

**Creative North Star: "The Friends' Screening Room"**

Warm, sleek, and playful: a relaxed movie-club interface with confident typography, quiet controls, and expressive movie artwork. The surrounding UI stays refined and restrained so posters, movie titles, and the group's choices carry the personality.

The system is mostly flat, with soft shadows for raised controls and artwork. Warm paper grounds the light interface; compact white surfaces, Cinema Blue actions, and Charcoal Ink type provide structure without turning every content group into a decorated card.

**Key Characteristics:**
- Artwork first, with quiet framing and compact controls.
- Bold, tightly tracked headings over a practical sans-serif body.
- Warm neutral surfaces with a restrained blue interaction palette.
- Pill-shaped filters, softly rounded media, and responsive movie grids.

Captured from the current working-tree CSS and React components, including uncommitted movie-grid motion changes. This is a source-derived record, not a browser-verified visual audit. Primary evidence: `app/globals.css`, `app/components/{FormPage,MovieSearch,MovieCard,MovieDetail,ViewControls,AppMenu,Theatre}.module.css`, `app/theatres/page.module.css`, `app/components/ListPicker/ListPicker.module.css`, and `app/components/{MovieGrid,MotionProvider}.tsx`.

## Colors

Warm neutrals support a muted, cool blue accent. The frontmatter holds the implemented color values: `primary` maps to CSS `--accent`; the remaining names match root custom properties. White is also exposed as `--on-dark` for text over dark surfaces.

### Primary

- **Cinema Blue** (`primary`): primary actions, links, focus indicators, and selected controls.
- **Soft Cinema Blue** (`accent-light`): the solid offset shadow beneath an active movie poster.
- **Blue Mist** (`accent-soft`): selected borders and interactive hover borders.
- **Blue Wash** (`accent-wash`): selected filters, menu hover backgrounds, and informational feedback.

### Neutral

- **Warm Paper** (`page`): the surrounding application canvas.
- **Charcoal Ink** (`text`): primary text and the dark floating comparison bar.
- **Soft Ink** (`text-soft`): control labels and secondary text.
- **Muted Ink** (`muted`, `muted-soft`): supporting metadata, hints, and placeholders.
- **White Surface** (`surface`): fields, menus, form cards, and the movie-detail body.
- **Paper Shade** (`surface-muted`): recessed neutral areas, genre chips, and image placeholders.
- **Quiet Border** (`border`): card boundaries and separators.
- **Control Border** (`border-strong`): fields, filters, and menu triggers.

### Semantic Feedback

- **Evergreen** (`success`, `success-wash`): success text and its pale background.
- **Brick Red** (`danger`, `danger-wash`, `danger-border`): error text, error backgrounds, and outlined error notices.
- The watched-poster badge currently uses its own brighter green (`#16a34a`); it is not the root success token. Preserve that distinction when matching existing cards.

**The Artwork First Rule.** Let movie imagery supply visual variety. Use the blue palette to express interaction and selection rather than introduce unrelated decorative accents.

## Typography

**Display and Body Font:** Helvetica, with Arial and sans-serif fallbacks. There is no separate display or monospace family in the shared system.

**Character:** Heavy weights and tight negative tracking give headings their confidence. Body text, control labels, and metadata remain straightforward and compact. These are observed roles, not a newly imposed mathematical type scale.

### Hierarchy

- **Headline:** the large theatre section heading; use its notably tight tracking only at heading scale.
- **Movie title:** the bold detail-page heading with a compact line height.
- **Title:** form and theatre-directory headings.
- **Brand:** compact, heavy navigation branding; form-page branding has a larger local variant.
- **Body:** inherited base text and native controls. Supporting prose often uses the smaller local size (`0.9344rem`).
- **Synopsis:** longer movie summaries, with a comfortable line height.
- **Label:** filters, field labels, and compact metadata.
- **Section label:** small uppercase movie-detail section headings. Uppercase is local to this role, not the default for every button.
- **Caption:** compact poster metadata and hints.

**The Role Before Scale Rule.** Reuse the nearest implemented text role. Do not normalize the existing fractional rem values or add a contrasting font as part of ordinary feature work.

## Layout

The theatre view uses a centered shell capped at `53.75rem`, with desktop width `min(100% - 2.5rem, 53.75rem)`. Its movie grid has five equal columns and row/column gaps of `2.125rem` / `1.125rem`. At a maximum width of `40rem`, it becomes three columns with a `0.625rem` gap; the shell uses `1.75rem` total horizontal clearance.

Search and movie-detail content use a `44rem` maximum width with `1.25rem` horizontal padding. The theatre directory uses a `28rem` card region; authentication/form cards cap at `23.75rem`. Do not force these distinct surfaces into one container width.

Spacing is mostly in quarter- and eighth-rem increments, with local optical adjustments. The frontmatter records recurring steps, not an enforced universal grid.

On narrow screens, filter options scroll horizontally and retain their full labels; mobile search/filter controls have a `2.75rem` minimum height. At `40rem` and above, the list picker is a centered dialog capped at `28rem`; below that threshold it is a full-width bottom sheet. Additional local breakpoints are `24rem` for directory poster stacks, `26rem` for the comparison bar, and `32rem` for the comparison page.

Fixed comparison actions respect `env(safe-area-inset-bottom)` and reserve extra content clearance. Preserve `min-width: 0`, wrapping, and the existing ellipsis rules in constrained flex/grid children.

## Elevation & Depth

The canvas and unboxed movie grid are mostly flat. White surfaces and quiet borders separate controls; shadows lift form cards, search, theatre-directory cards, menus, and movie artwork. Dark image gradients support readable poster/backdrop text; they are functional overlays, not a general page-background motif.

### Shadow Vocabulary

- **Shared surface:** `0 0.75rem 1.75rem rgba(43, 43, 73, 0.08)`; root `--shadow`, used on form cards, discovery search, and theatre-directory cards.
- **Poster resting:** `0 8px 20px rgba(43, 43, 73, 0.12)`.
- **Poster hover/focus:** `0 14px 28px rgba(43, 43, 73, 0.2)`, paired with a small upward translation.
- **Active poster:** a solid Cinema Blue Light offset (`0 10px 0 var(--accent-light)`), increasing to `14px` on hover/focus.
- **App menu:** `0 0.625rem 1.875rem rgba(0, 0, 0, 0.12)`.
- **Floating comparison actions:** `0 0.75rem 1.75rem rgba(20, 20, 32, 0.28)`.
- **List-picker sheet:** `0 -0.75rem 2rem rgba(0, 0, 0, 0.2)`, over a translucent dark scrim.

**The Quiet Frame Rule.** Preserve the open poster grid. Do not wrap every movie and metadata row in another white, bordered, elevated card.

## Shapes

Filters, compact actions, circular icon triggers, and floating comparison actions use the root pill radius. Form fields and movie-grid posters share softly rounded control corners; detail posters use the slightly larger media radius. Menus and directory cards use panel corners, while discovery search, form cards, and sheets progressively soften.

Posters retain their `2 / 3` aspect ratio and cropped image fill. Avatars and selection/watched markers are circular. The list-picker sheet rounds its upper corners on mobile and all corners in its desktop dialog form. Thin borders define controls; outlined selections and the active-poster offset remain visually distinct states.

## Components

### Buttons

Refined and restrained, with compact padding and clear labels. Form submit buttons use Cinema Blue with white text and control-radius corners. The movie-detail add action uses a smaller pill variant; its hover/focus treatment swaps to Blue Wash with blue text. Do not invent that hover treatment for submit buttons, which currently rely on the shared focus ring.

Disabled submit/menu actions use reduced opacity and progress cursors where implemented. Preserve each control's actual disabled/loading semantics rather than treating opacity alone as behavior.

### Filters and Chips

Unselected filter pills use White Surface, Soft Ink labels, and Control Border. Hover changes border/text toward blue. Selection adds Blue Wash with a Blue Mist border and Cinema Blue text. Mobile option rows scroll rather than compress their labels.

Genre chips are descriptive, not selected filters: they use Paper Shade, a quiet border, and compact bold text.

### Cards and Artwork

Theatre-directory cards are white, softly elevated navigation rows with compact text and overlapping miniature posters. Form cards are more padded and have larger corners.

Movie-grid cards are unboxed. A poster button contains the artwork, lower readability gradient, title/year, and state markers, with avatar/seen-count metadata below. Resting posters lift on hover/focus; active posters use the solid blue offset. Selection uses a Charcoal Ink outline and check marker; watched state uses its separate green badge.

### Inputs and Search

Form fields use a white fill, Control Border, control-radius corners, and inherited text. Discovery search is a larger rounded, softly elevated field; theatre filtering uses a compact pill search container. Both composite searches put the focus ring on the container through `:focus-within`.

The shared keyboard indicator is a `0.1875rem` outline with a `0.125rem` offset. The existing discovery-search clear control has its own two-pixel ring. Keep root `--focus` contextual: image overlays and the dark comparison bar switch it to white. Search inputs are at least `1rem` to avoid mobile focus zoom.

### Navigation and Overlays

Navigation uses a compact heavy brand link and a circular white menu trigger. The anchored menu has a white panel, quiet border, soft shadow, and rounded items with Blue Wash hover treatment; it is not a full-width decorative navigation rail.

The list picker uses an opaque white sheet/dialog over a translucent scrim. Its content scrolls within viewport-relative height limits. The comparison toolbar is a dark floating pill with white actions and safe-area clearance.

### Motion

Poster transform/shadow transitions last `0.2s` with CSS `ease`. The movie grid currently defaults to a position-layout spring (stiffness `380`, damping `38`); optional modes are glide (`0.28s`, cubic-bezier `0.16, 1, 0.3, 1`), fade (`0.2s`, ease-out), and off. Grid opacity/scale entry and exit last `0.16s`; moving modes start/end at scale `0.96`.

Respect the existing reduced-motion paths: `MotionProvider` uses the user's preference, the grid switches to off, and poster hover/active transforms and transitions are removed. This records current implementation, not a requirement to animate every component.

## Do's and Don'ts

### Do:

- **Do** reuse the root palette and contextual focus variable rather than hardcode new brand colors.
- **Do** let movie artwork carry expression while surrounding controls remain compact and quiet.
- **Do** reuse the existing text roles, rounded forms, container widths, and responsive grid behavior.
- **Do** preserve distinct hover, focus, active, selected, watched, disabled, and loading states.
- **Do** retain reduced-motion handling and safe-area clearance for fixed controls.

### Don't:

- **Don't** turn the unboxed poster grid into nested elevated cards.
- **Don't** replace the light paper canvas or Helvetica family during an ordinary feature change.
- **Don't** use semantic success/danger colors as unrelated decorative accents.
- **Don't** suppress visible keyboard focus or apply text truncation where content needs to wrap.
- **Don't** treat synthesized sidecar tonal ramps or static preview snippets as new production tokens or React behavior.
