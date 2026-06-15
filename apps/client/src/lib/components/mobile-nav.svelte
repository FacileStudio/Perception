<script lang="ts">
  import { page } from '$app/stores';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  const items = [
    { href: '/chat', label: 'Chat', icon: 'solar:chat-dots-linear', match: (p: string) => p.startsWith('/chat') },
    { href: '/context', label: 'Context', icon: 'solar:folder-with-files-linear', match: (p: string) => p === '/context' },
    { href: '/entities', label: 'Entities', icon: 'solar:bill-list-linear', match: (p: string) => p === '/entities' },
    { href: '/stats', label: 'Stats', icon: 'solar:chart-square-linear', match: (p: string) => p === '/stats' },
    { href: '/resources', label: 'Resources', icon: 'solar:documents-linear', match: (p: string) => p === '/resources' },
    { href: '/proposals', label: 'Proposals', icon: 'solar:hand-shake-linear', match: (p: string) => p === '/proposals' },
    { href: '/forecasts', label: 'Forecasts', icon: 'solar:telescope-linear', match: (p: string) => p.startsWith('/forecasts') },
  ];
</script>

<nav
  class="fixed inset-x-0 z-50 flex justify-center px-3 md:hidden"
  style="bottom: max(0.75rem, env(safe-area-inset-bottom))"
>
  <div
    class="flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 rounded-full border border-border/40 bg-background/55 p-1.5 shadow-lg shadow-black/10 ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150"
  >
    {#each items as item (item.href)}
      {@const active = item.match($page.url.pathname)}
      <a
        href={item.href}
        aria-label={item.label}
        title={item.label}
        class="flex items-center justify-center rounded-full px-3 py-2 transition-all duration-200 {active
          ? 'bg-foreground text-background shadow-sm'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
      >
        <Icon icon={item.icon} class="size-[22px]" />
      </a>
    {/each}
  </div>
</nav>
