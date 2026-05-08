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
    { href: '/', label: 'Chat', icon: 'solar:chat-dots-bold-duotone' },
    { href: '/context', label: 'Context', icon: 'solar:folder-with-files-bold-duotone' },
    { href: '/stats', label: 'Stats', icon: 'solar:chart-square-bold-duotone' },
  ];
</script>

<aside class="flex w-full shrink-0 flex-col border-b border-zinc-200/80 bg-white/95 backdrop-blur md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
  <div class="px-5 pb-6 pt-6">
    <PerceptionLogo subtitle="Operational context without archaeology" iconSizeClass="size-5" />
  </div>

  <nav class="flex flex-1 flex-col gap-1 px-3 pb-4">
    {#each navLinks as link}
      {@const active = $page.url.pathname === link.href}
      <a
        href={link.href}
        class="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors {active ? 'bg-zinc-950 font-medium text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'}"
      >
        <Icon icon={link.icon} class="size-4 shrink-0" />
        {link.label}
      </a>
    {/each}
  </nav>

  <Separator />

  <div class="p-4">
    <Button
      variant="ghost"
      class="min-h-11 w-full justify-start gap-3 rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
      onclick={onLogout}
    >
      <Icon icon="solar:logout-3-bold-duotone" class="size-4" />
      Logout
    </Button>
  </div>
</aside>
