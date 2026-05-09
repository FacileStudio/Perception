<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { AuthUser } from '$lib/api';
  import { buildTitle } from '$lib/head';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  let users = $state<AuthUser[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const res = await api.users.list();
      users = res.users;
    } catch {
      users = [];
    } finally {
      loading = false;
    }
  });

  function formatDate(iso: string): string {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(iso));
  }
</script>

<svelte:head>
  <title>{buildTitle('Users')}</title>
</svelte:head>

<div class="flex flex-col h-full">
  <div class="border-b border-zinc-200/80 bg-white px-6 py-5">
    <h1 class="text-lg font-semibold text-zinc-950">Team</h1>
    {#if !loading}
      <p class="mt-0.5 text-sm text-zinc-500">{users.length} {users.length === 1 ? 'member' : 'members'}</p>
    {/if}
  </div>

  <div class="flex-1 overflow-auto p-6">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-zinc-400">Loading...</span>
      </div>
    {:else if users.length === 0}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-zinc-400">No users found.</span>
      </div>
    {:else}
      <div class="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-zinc-100 bg-zinc-50/50">
              <th class="px-4 py-3 text-left font-medium text-zinc-500">User</th>
              <th class="px-4 py-3 text-left font-medium text-zinc-500">Source</th>
              <th class="px-4 py-3 text-left font-medium text-zinc-500">Joined</th>
            </tr>
          </thead>
          <tbody>
            {#each users as user}
              <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50 transition-colors">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <div class="size-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0" style="background-color: {user.color}">
                      {(user.name ?? user.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      {#if user.name}
                        <div class="font-medium text-zinc-950">{user.name}</div>
                        <div class="text-xs text-zinc-400">{user.email}</div>
                      {:else}
                        <div class="font-medium text-zinc-950">{user.email}</div>
                      {/if}
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {user.source === 'oidc' ? 'bg-indigo-50 text-indigo-700' : 'bg-zinc-100 text-zinc-600'}">
                    {user.source === 'oidc' ? 'SSO' : 'Local'}
                  </span>
                </td>
                <td class="px-4 py-3 text-zinc-500">
                  {user.created_at ? formatDate(user.created_at) : '—'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
