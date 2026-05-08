# Frontend

Use SvelteKit with Svelte 5 runes. **Static build only** (`@sveltejs/adapter-static`, `fallback: 'index.html'`). No SSR. All API calls are client-side fetch with `credentials: 'include'`.

## Stack

- **SvelteKit** + `@sveltejs/adapter-static`
- **shadcn-svelte** components only (built on `bits-ui`)
- **Tailwind CSS v4** via `@tailwindcss/vite` — utility classes only
- **No custom CSS** — one `app.css` with Tailwind import + shadcn CSS variables only
- **Theme**: black and white, minimal, no gradients, no shadows beyond subtle borders

## Routes

```text
apps/client/src/routes/
|-- +layout.svelte
|-- +layout.ts       (ssr = false)
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
- shadcn-svelte components only — no muse, no raw HTML styling.
- B&W palette: `bg-white`, `bg-black`, `text-black`, `text-white`, grays via Tailwind `zinc-*` tokens.
- No gradients. No drop shadows (use `border` only). No color accents.
