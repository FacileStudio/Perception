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

  let tab = $state<'signin' | 'signup'>('signin');
  let email = $state('');
  let password = $state('');
  let name = $state('');
  let error = $state($page.url.searchParams.get('error') === 'oidc_failed' ? 'SSO login failed. Please try again.' : '');
  let loading = $state(false);

  onMount(async () => {
    await loadAuthConfig();
    if (auth.config.sso_only) tab = 'signin';
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
  <title>{buildTitle(!auth.config.sso_only && tab === 'signup' ? 'Create account' : 'Sign in')}</title>
  <meta name="description" content="Sign in to Perception and skip the folklore." />
</svelte:head>

<div class="flex min-h-screen">
  <div class="hidden lg:flex lg:w-1/2 flex-col bg-black px-12 py-10">
    <a href="/" class="flex items-center gap-3 mb-auto">
      <Icon icon="solar:eye-linear" class="size-7 text-white" />
      <span class="text-xl font-bold tracking-tight text-white">Perception</span>
    </a>

    <div class="mb-auto">
      <h2 class="text-4xl font-bold text-white leading-tight tracking-tight">
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
    <div class="w-full max-w-sm">
      <div class="mb-8">
        <h1 class="text-2xl font-bold tracking-tight text-foreground">
          {!auth.config.sso_only && tab === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {!auth.config.sso_only && tab === 'signup'
            ? 'Fill in your details to get started.'
            : auth.config.sso_only
              ? 'Sign in with your organization account.'
              : 'Sign in with your email and password.'}
        </p>
      </div>

      {#if !auth.configLoaded}
        <div class="h-40"></div>
      {:else}
        {#if !auth.config.sso_only}
          <div class="mb-6 flex rounded-lg border border-border bg-muted p-1 gap-1">
            <button
              class="flex-1 rounded-md py-1.5 text-sm font-medium transition-colors {tab === 'signin'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => { tab = 'signin'; error = ''; }}
            >
              Sign in
            </button>
            <button
              class="flex-1 rounded-md py-1.5 text-sm font-medium transition-colors {tab === 'signup'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => { tab = 'signup'; error = ''; }}
            >
              Sign up
            </button>
          </div>

          <form onsubmit={tab === 'signin' ? handleSignIn : handleSignUp} class="space-y-4">
            {#if tab === 'signup'}
              <div class="space-y-1.5">
                <Label for="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  bind:value={name}
                  disabled={loading}
                  autocomplete="name"
                  required
                />
              </div>
            {/if}

            <div class="space-y-1.5">
              <Label for="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                bind:value={email}
                disabled={loading}
                autocomplete="email"
                required
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
                autocomplete={tab === 'signin' ? 'current-password' : 'new-password'}
                required
              />
            </div>

            {#if error}
              <p class="text-sm text-destructive">{error}</p>
            {/if}

            <Button type="submit" class="w-full" disabled={loading}>
              {tab === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
          </form>
        {/if}

        {#if auth.config.oidc_enabled}
          {#if !auth.config.sso_only}
            <div class="my-5 flex items-center gap-3">
              <div class="h-px flex-1 bg-border"></div>
              <span class="text-xs text-muted-foreground">or</span>
              <div class="h-px flex-1 bg-border"></div>
            </div>
          {/if}

          <a href="{API_BASE}/auth/oidc" class="block">
            <Button variant="outline" class="w-full" type="button">
              Continue with SSO
            </Button>
          </a>
        {/if}

        {#if auth.config.sso_only && !auth.config.oidc_enabled}
          <p class="text-sm text-destructive">SSO is not configured. Contact your administrator.</p>
        {/if}
      {/if}
    </div>
  </div>
</div>
