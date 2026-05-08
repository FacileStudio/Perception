<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Card } from '$lib/components/ui/card';
  import PerceptionLogo from '$lib/components/perception-logo.svelte';

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
      goto('/');
    } catch {
      error = 'Invalid password.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(228,228,231,0.9),_rgba(255,255,255,1)_45%)] px-4">
  <Card class="w-full max-w-sm rounded-[28px] border-zinc-200/80 p-8 shadow-[0_24px_80px_-48px_rgba(24,24,27,0.55)]">
    <div class="mb-6">
      <PerceptionLogo subtitle="Read signal. Skip folklore." />
      <p class="mt-4 text-sm text-zinc-500">Enter your access password to continue.</p>
    </div>
    <form onsubmit={handleSubmit} class="flex flex-col gap-3">
      <Input
        type="password"
        placeholder="Password"
        bind:value={password}
        disabled={loading}
        autocomplete="current-password"
        class="h-11 rounded-xl"
      />
      {#if error}
        <p class="text-xs text-red-600">{error}</p>
      {/if}
      <Button type="submit" disabled={loading || !password.trim()} class="h-11 rounded-xl">
        {loading ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  </Card>
</div>
