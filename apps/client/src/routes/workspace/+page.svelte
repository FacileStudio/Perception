<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth, switchWorkspace, loadWorkspaces } from '$lib/stores/auth.svelte';
  import { authClient } from '$lib/auth-client';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';

  type Member = { id: string; user_id: string; name: string; email: string; role: string; joined_at: string };
  type WsStats = { event_count: number; entity_count: number; session_count: number; open_forecast_count: number };

  let members = $state<Member[]>([]);
  let stats = $state<WsStats | null>(null);
  let loading = $state(true);

  let showInvite = $state(false);
  let inviteEmail = $state('');
  let inviteRole = $state<'member' | 'admin'>('member');
  let inviting = $state(false);
  let inviteError = $state('');
  let inviteSuccess = $state('');

  let showCreate = $state(false);
  let newWsName = $state('');
  let creating = $state(false);
  let createError = $state('');

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      if (auth.workspace) {
        const [m, s] = await Promise.all([
          api.workspaces.members(auth.workspace.id),
          api.workspaces.stats(auth.workspace.id),
        ]);
        members = m.members;
        stats = s;
      }
    } catch {
    } finally {
      loading = false;
    }
  }

  async function handleInvite(e: Event) {
    e.preventDefault();
    if (!inviteEmail.trim() || !auth.workspace) return;
    inviting = true;
    inviteError = '';
    inviteSuccess = '';
    try {
      await authClient.organization.inviteMember({
        email: inviteEmail.trim(),
        role: inviteRole,
        organizationId: auth.workspace.id,
      });
      inviteSuccess = `Invitation sent to ${inviteEmail}`;
      inviteEmail = '';
      await loadData();
    } catch (err: any) {
      inviteError = err?.message ?? 'Failed to send invitation.';
    } finally {
      inviting = false;
    }
  }

  async function handleCreateWorkspace(e: Event) {
    e.preventDefault();
    if (!newWsName.trim()) return;
    creating = true;
    createError = '';
    try {
      const res = await authClient.organization.create({
        name: newWsName.trim(),
        slug: newWsName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      });
      if (res.error) {
        createError = res.error.message ?? 'Failed to create workspace.';
        return;
      }
      await loadWorkspaces();
      if (res.data?.id) {
        await switchWorkspace(res.data.id);
        window.location.reload();
      }
    } catch (err: any) {
      createError = err?.message ?? 'Failed to create workspace.';
    } finally {
      creating = false;
    }
  }

  async function handleRemoveMember(memberId: string, email: string) {
    if (!confirm(`Remove ${email} from this workspace?`)) return;
    try {
      await authClient.organization.removeMember({ memberIdOrEmail: memberId });
      await loadData();
    } catch {
    }
  }

  async function handleChangeRole(memberId: string, role: string) {
    const newRole = role === 'admin' ? 'member' : 'admin';
    try {
      await authClient.organization.updateMemberRole({ memberId, role: newRole });
      await loadData();
    } catch {
    }
  }
</script>

<svelte:head>
  <title>{buildTitle('Workspace')}</title>
</svelte:head>

<div class="flex-1 overflow-auto p-8">
  <div class="mx-auto max-w-3xl space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-zinc-950">Workspace</h1>
        {#if auth.workspace}
          <p class="mt-1 text-sm text-zinc-500">{auth.workspace.name}</p>
        {/if}
      </div>
      <Button onclick={() => (showCreate = !showCreate)} variant="outline" size="sm">
        <Icon icon="solar:add-circle-bold-duotone" class="mr-1.5 size-4" />
        New workspace
      </Button>
    </div>

    {#if showCreate}
      <div class="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 class="text-lg font-semibold text-zinc-950">Create workspace</h2>
        {#if createError}
          <p class="mt-2 text-sm text-destructive">{createError}</p>
        {/if}
        <form onsubmit={handleCreateWorkspace} class="mt-4 flex items-end gap-3">
          <div class="flex-1 space-y-1.5">
            <Label for="ws-name">Workspace name</Label>
            <Input id="ws-name" bind:value={newWsName} placeholder="My Team" disabled={creating} />
          </div>
          <Button type="submit" disabled={creating || !newWsName.trim()}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </form>
      </div>
    {/if}

    {#if stats}
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div class="rounded-lg border border-zinc-200 bg-white p-4">
          <p class="text-2xl font-bold text-zinc-950">{stats.event_count.toLocaleString()}</p>
          <p class="text-xs text-zinc-500">Events</p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-white p-4">
          <p class="text-2xl font-bold text-zinc-950">{stats.entity_count.toLocaleString()}</p>
          <p class="text-xs text-zinc-500">Entities</p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-white p-4">
          <p class="text-2xl font-bold text-zinc-950">{stats.session_count.toLocaleString()}</p>
          <p class="text-xs text-zinc-500">Chat sessions</p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-white p-4">
          <p class="text-2xl font-bold text-zinc-950">{stats.open_forecast_count.toLocaleString()}</p>
          <p class="text-xs text-zinc-500">Open forecasts</p>
        </div>
      </div>
    {/if}

    <div class="rounded-lg border border-zinc-200 bg-white">
      <div class="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
        <h2 class="text-lg font-semibold text-zinc-950">Members</h2>
        <Button onclick={() => (showInvite = !showInvite)} variant="outline" size="sm">
          <Icon icon="solar:user-plus-bold-duotone" class="mr-1.5 size-4" />
          Invite
        </Button>
      </div>

      {#if showInvite}
        <div class="border-b border-zinc-100 px-6 py-4">
          {#if inviteError}
            <p class="mb-2 text-sm text-destructive">{inviteError}</p>
          {/if}
          {#if inviteSuccess}
            <p class="mb-2 text-sm text-emerald-600">{inviteSuccess}</p>
          {/if}
          <form onsubmit={handleInvite} class="flex items-end gap-3">
            <div class="flex-1 space-y-1.5">
              <Label for="invite-email">Email</Label>
              <Input id="invite-email" type="email" bind:value={inviteEmail} placeholder="colleague@company.com" disabled={inviting} />
            </div>
            <div class="space-y-1.5">
              <Label for="invite-role">Role</Label>
              <select
                id="invite-role"
                bind:value={inviteRole}
                class="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                disabled={inviting}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
              {inviting ? 'Sending...' : 'Send invite'}
            </Button>
          </form>
        </div>
      {/if}

      {#if loading}
        <div class="p-6 text-center text-sm text-zinc-400">Loading...</div>
      {:else if members.length === 0}
        <div class="p-6 text-center text-sm text-zinc-400">No members.</div>
      {:else}
        <div class="divide-y divide-zinc-100">
          {#each members as member}
            <div class="flex items-center gap-4 px-6 py-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                {member.name?.slice(0, 2).toUpperCase() ?? member.email.slice(0, 2).toUpperCase()}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-zinc-950">{member.name || member.email}</p>
                <p class="truncate text-xs text-zinc-500">{member.email}</p>
              </div>
              <span class="rounded-full border px-2.5 py-0.5 text-xs font-medium {member.role === 'owner' ? 'border-amber-200 bg-amber-50 text-amber-700' : member.role === 'admin' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}">
                {member.role}
              </span>
              {#if member.role !== 'owner' && member.user_id !== auth.user?.id}
                <div class="flex gap-1">
                  <button
                    onclick={() => handleChangeRole(member.id, member.role)}
                    class="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    title="Toggle admin"
                  >
                    <Icon icon="solar:shield-bold-duotone" class="size-4" />
                  </button>
                  <button
                    onclick={() => handleRemoveMember(member.id, member.email)}
                    class="rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Remove member"
                  >
                    <Icon icon="solar:trash-bin-trash-bold-duotone" class="size-4" />
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if auth.workspaces.length > 1}
      <div class="rounded-lg border border-zinc-200 bg-white">
        <div class="border-b border-zinc-100 px-6 py-4">
          <h2 class="text-lg font-semibold text-zinc-950">All workspaces</h2>
        </div>
        <div class="divide-y divide-zinc-100">
          {#each auth.workspaces as ws}
            {@const active = ws.id === auth.workspace?.id}
            <button
              onclick={() => { if (!active) handleSwitchWorkspace(ws.id); }}
              class="flex w-full items-center gap-4 px-6 py-3 text-left transition-colors {active ? 'bg-zinc-50' : 'hover:bg-zinc-50'}"
              disabled={active}
            >
              <Icon
                icon={active ? 'solar:check-circle-bold' : 'solar:buildings-linear'}
                class="size-5 shrink-0 {active ? 'text-emerald-500' : 'text-zinc-300'}"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-zinc-950">{ws.name}</p>
                <p class="text-xs text-zinc-500">{ws.slug}</p>
              </div>
              <span class="text-xs text-zinc-400">{ws.role}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
