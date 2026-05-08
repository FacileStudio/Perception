<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Card } from '$lib/components/ui/card';

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

<div class="flex h-screen items-center justify-center bg-white">
  <Card class="w-full max-w-sm p-8">
    <div class="mb-6">
      <h1 class="font-mono text-lg font-semibold">perception</h1>
      <p class="mt-1 text-sm text-zinc-500">Enter your access password to continue.</p>
    </div>
    <form onsubmit={handleSubmit} class="flex flex-col gap-3">
      <Input
        type="password"
        placeholder="Password"
        bind:value={password}
        disabled={loading}
        autocomplete="current-password"
      />
      {#if error}
        <p class="text-xs text-red-600">{error}</p>
      {/if}
      <Button type="submit" disabled={loading || !password.trim()}>
        {loading ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  </Card>
</div>
