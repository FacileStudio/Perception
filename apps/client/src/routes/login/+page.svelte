<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import { auth, loadAuthConfig } from '$lib/stores';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { buildTitle } from '$lib/head';
  import { ensureSolar } from '$lib/solar';
  import Icon from '@iconify/svelte';

  ensureSolar();

  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  let password = $state('');
  let error = $state($page.url.searchParams.get('error') === 'oidc_failed' ? 'SSO login failed. Please try again.' : '');
  let loading = $state(false);

  onMount(async () => {
    await loadAuthConfig();
  });

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
          {auth.config.sso_only ? 'Sign in with your organization account.' : 'Enter your access password to continue.'}
        </p>
      </div>

      {#if error}
        <p class="mb-4 text-sm text-destructive">{error}</p>
      {/if}

      {#if !auth.config.sso_only}
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

          <Button type="submit" class="w-full" disabled={loading || !password.trim()}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      {/if}

      {#if auth.config.oidc_enabled}
        {#if !auth.config.sso_only}
          <div class="my-6 flex items-center gap-3">
            <div class="h-px flex-1 bg-zinc-200"></div>
            <span class="text-xs text-zinc-400">or continue with</span>
            <div class="h-px flex-1 bg-zinc-200"></div>
          </div>
        {/if}

        <a
          href="{API_BASE}/auth/oidc"
          class="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50"
        >
          <Icon icon="solar:key-bold-duotone" class="size-4" />
          Sign in with SSO
        </a>
      {/if}
    </div>
  </div>
</div>
