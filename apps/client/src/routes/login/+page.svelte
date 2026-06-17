<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authClient } from '$lib/auth-client';
  import { auth, checkAuth, loadAuthConfig } from '$lib/stores';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { buildTitle } from '$lib/head';
  import { ensureSolar } from '$lib/solar';
  import Icon from '@iconify/svelte';

  ensureSolar();

  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  let mode = $state<'signin' | 'signup'>('signin');
  let email = $state('');
  let password = $state('');
  let name = $state('');
  let error = $state($page.url.searchParams.get('error') === 'oidc_failed' ? 'SSO login failed. Please try again.' : '');
  let loading = $state(false);

  onMount(async () => {
    await loadAuthConfig();
  });

  async function handleSignIn(e: Event) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    loading = true;
    error = '';
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        error = res.error.message ?? 'Sign in failed.';
        return;
      }
      await checkAuth();
      goto('/chat');
    } catch {
      error = 'Sign in failed.';
    } finally {
      loading = false;
    }
  }

  async function handleSignUp(e: Event) {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !name.trim()) return;
    loading = true;
    error = '';
    try {
      const res = await authClient.signUp.email({ email, password, name });
      if (res.error) {
        error = res.error.message ?? 'Sign up failed.';
        return;
      }
      await checkAuth();
      goto('/chat');
    } catch {
      error = 'Sign up failed.';
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
      <Icon icon="solar:eye-linear" class="size-6 text-white" />
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
      &copy; {new Date().getFullYear()} Perception by Facile.
    </p>
  </div>

  <div class="flex w-full lg:w-1/2 flex-col items-center justify-center px-8 py-12 bg-background">
    {#if !auth.configLoaded}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-muted-foreground">Loading...</span>
      </div>
    {:else}
    <div class="w-full max-w-sm">
      <div class="mb-8">
        <h1 class="font-[Goga] text-2xl tracking-tight text-foreground">
          {auth.config.sso_only ? 'Welcome' : mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {auth.config.sso_only ? 'Sign in with your organization account.' : mode === 'signin' ? 'Sign in with your email and password.' : 'Fill in your details to get started.'}
        </p>
      </div>

      {#if error}
        <p class="mb-4 text-sm text-destructive">{error}</p>
      {/if}

      {#if auth.config.sso_only && auth.config.oidc_enabled}
        <a
          href="{API_BASE}/auth/oidc"
          class="flex w-full items-center justify-center gap-2 rounded-md border border-primary bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          <Icon icon="solar:key-linear" class="size-4" />
          Sign in with SSO
        </a>
      {:else}
        {#if mode === 'signin'}
          <form onsubmit={handleSignIn} class="space-y-4">
            <div class="space-y-1.5">
              <Label for="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                bind:value={email}
                disabled={loading}
                autocomplete="email"
              />
            </div>

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

            <Button type="submit" class="w-full" disabled={loading || !email.trim() || !password.trim()}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p class="mt-4 text-center text-sm text-muted-foreground">
            No account?
            <button class="underline text-foreground hover:text-foreground/80" onclick={() => { mode = 'signup'; error = ''; }}>
              Sign up
            </button>
          </p>
        {:else}
          <form onsubmit={handleSignUp} class="space-y-4">
            <div class="space-y-1.5">
              <Label for="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                bind:value={name}
                disabled={loading}
                autocomplete="name"
              />
            </div>

            <div class="space-y-1.5">
              <Label for="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                bind:value={email}
                disabled={loading}
                autocomplete="email"
              />
            </div>

            <div class="space-y-1.5">
              <Label for="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                bind:value={password}
                disabled={loading}
                autocomplete="new-password"
              />
            </div>

            <Button type="submit" class="w-full" disabled={loading || !email.trim() || !password.trim() || !name.trim()}>
              {loading ? 'Creating account...' : 'Sign up'}
            </Button>
          </form>

          <p class="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?
            <button class="underline text-foreground hover:text-foreground/80" onclick={() => { mode = 'signin'; error = ''; }}>
              Sign in
            </button>
          </p>
        {/if}

        {#if auth.config.oidc_enabled}
          <div class="my-6 flex items-center gap-3">
            <div class="h-px flex-1 bg-border"></div>
            <span class="text-xs text-muted-foreground">or continue with</span>
            <div class="h-px flex-1 bg-border"></div>
          </div>

          <a
            href="{API_BASE}/auth/oidc"
            class="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Icon icon="solar:key-linear" class="size-4" />
            Sign in with SSO
          </a>
        {/if}
      {/if}
    </div>
    {/if}
  </div>
</div>
