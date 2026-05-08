# Frontend

Use SvelteKit with Svelte 5 runes and muse.

## Routes

```text
apps/client/src/routes/
|-- +layout.svelte
|-- +page.svelte
|-- context/
|   `-- +page.svelte
|-- stats/
|   `-- +page.svelte
`-- login/
    `-- +page.svelte
```

## Views

- `/`: chat, source drawer, answer timeline.
- `/context`: searchable event feed with provider filters and quality badges.
- `/stats`: compact operational signals and freshness.
- `/login`: password form.

## Design Rules

- Chat first.
- Dense operational UI, not marketing.
- Every answer source can be opened.
- Show degraded/missing embedding state in context feed.
- Use muse components first, shadcn-svelte only where muse lacks coverage.
- Import `@facile/lib/styles` once in root layout.
