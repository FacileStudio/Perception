<script lang="ts">
  import { page } from '$app/stores';
  import { Button } from '$lib/components/ui/button';
  import { Separator } from '$lib/components/ui/separator';
  import PerceptionLogo from '$lib/components/perception-logo.svelte';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  let { onLogout }: { onLogout: () => void | Promise<void> } = $props();

  ensureSolar();

  const navLinks = [
    { href: '/', label: 'Chat', icon: 'solar:chat-dots-bold-duotone', match: (p: string) => p === '/' || p.startsWith('/chat') },
    { href: '/context', label: 'Context', icon: 'solar:folder-with-files-bold-duotone', match: (p: string) => p === '/context' },
    { href: '/stats', label: 'Stats', icon: 'solar:chart-square-bold-duotone', match: (p: string) => p === '/stats' },
    { href: '/settings', label: 'Settings', icon: 'solar:settings-bold-duotone', match: (p: string) => p === '/settings' },
  ];
</script>

<aside class="flex w-full shrink-0 flex-col border-b border-zinc-200/80 bg-white/95 backdrop-blur md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
  <div class="px-5 pb-6 pt-8">
    <PerceptionLogo
      class="gap-2"
      subtitle=""
      iconFrameClass="size-7"
      iconSizeClass="size-7"
      titleClass="text-2xl font-bold"
    />
  </div>

  <nav class="flex flex-1 flex-col gap-1 px-3">
    {#each navLinks as link}
      {@const active = link.match($page.url.pathname)}
      <a
        href={link.href}
        class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors {active ? 'bg-zinc-950 font-medium text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'}"
      >
        <Icon icon={link.icon} class="size-4 shrink-0 {active ? 'text-white' : ''}" />
        {link.label}
      </a>
    {/each}
  </nav>

  <Separator />

  <div class="p-4">
    <Button
      variant="ghost"
      size="sm"
      class="w-full justify-start gap-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
      onclick={onLogout}
    >
      <Icon icon="solar:logout-3-bold-duotone" class="size-4" />
      Logout
    </Button>
  </div>
</aside>
