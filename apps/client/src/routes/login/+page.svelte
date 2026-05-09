<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { buildTitle } from '$lib/head';
  import { ensureSolar } from '$lib/solar';
  import Icon from '@iconify/svelte';

  ensureSolar();

  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!password.trim()) return;
    loading = true;
    error = '';
    try {
      await api.auth.login(password);
      auth.authenticated = true;
      goto('/chat');
    } catch {
      error = 'Invalid password.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{buildTitle('Sign in')}</title>
  <meta name="description" content="Sign in to Perception and skip the folklore." />
</svelte:head>

<div class="flex min-h-screen">
  <div class="hidden lg:flex lg:w-1/2 flex-col bg-zinc-950 px-12 py-10">
    <a href="/" class="flex items-center gap-2 mb-auto">
      <Icon icon="solar:eye-bold-duotone" class="size-6 text-white" />
      <span class="font-[Goga] text-xl tracking-tight text-white">Perception</span>
    </a>

    <div class="mb-auto">
      <h2 class="font-[Goga] text-4xl text-white leading-tight tracking-tight">
        Interrogate the noise.<br />See clearly.
      </h2>
      <p class="mt-4 text-sm text-white/50 max-w-xs leading-relaxed">
        AI-powered operational memory for engineering teams.
      </p>
    </div>

    <p class="text-xs text-white/30">
      © {new Date().getFullYear()} Perception by Facile.
    </p>
  </div>

  <div class="flex w-full lg:w-1/2 flex-col items-center justify-center px-8 py-12 bg-background">
    <div class="w-full max-w-sm">
      <div class="mb-8">
        <h1 class="font-[Goga] text-2xl tracking-tight text-foreground">Welcome back</h1>
        <p class="mt-1.5 text-sm text-muted-foreground">
          Enter your access password to continue.
        </p>
      </div>

      <form onsubmit={handleSubmit} class="space-y-4">
        <div class="space-y-1.5">
          <Label for="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            bind:value={password}
            disabled={loading}
            autocomplete="current-password"
          />
        </div>

        {#if error}
          <p class="text-sm text-destructive">{error}</p>
        {/if}

        <Button type="submit" class="w-full" disabled={loading || !password.trim()}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </div>
  </div>
</div>
