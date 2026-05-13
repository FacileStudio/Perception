<script lang="ts">
  import { api } from '$lib/api';
  import { switchWorkspace, loadWorkspaces } from '$lib/stores/auth.svelte';
  import { Drawer } from '$lib/components/ui/drawer';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import Icon from '@iconify/svelte';

  let {
    open = $bindable(false),
  }: {
    open: boolean;
  } = $props();

  let name = $state('');
  let slug = $state('');
  let creating = $state(false);
  let error = $state('');

  let autoSlug = $state(true);

  $effect(() => {
    if (autoSlug && name) {
      slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
  });

  function handleSlugInput() {
    autoSlug = false;
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    creating = true;
    error = '';
    try {
      const res = await api.workspaces.create(name.trim(), slug.trim() || undefined);
      await loadWorkspaces();
      if (res.id) {
        await switchWorkspace(res.id);
        window.location.reload();
      }
    } catch (err: any) {
      error = err?.message ?? 'Failed to create workspace.';
    } finally {
      creating = false;
    }
  }

  $effect(() => {
    if (!open) {
      name = '';
      slug = '';
      error = '';
      autoSlug = true;
    }
  });
</script>

<Drawer bind:open title="Create workspace">
  {#if error}
    <div class="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <Icon icon="solar:danger-triangle-bold-duotone" class="size-4 shrink-0" />
      {error}
    </div>
  {/if}

  <form onsubmit={handleCreate} class="space-y-5">
    <div class="space-y-1.5">
      <Label for="new-ws-name">Workspace name</Label>
      <Input id="new-ws-name" bind:value={name} placeholder="My Team" disabled={creating} />
      <p class="text-xs text-zinc-400">The display name for this workspace.</p>
    </div>

    <div class="space-y-1.5">
      <Label for="new-ws-slug">Slug</Label>
      <Input id="new-ws-slug" bind:value={slug} placeholder="my-team" disabled={creating} oninput={handleSlugInput} />
      <p class="text-xs text-zinc-400">URL-safe identifier. Auto-generated from the name if left unchanged.</p>
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <Button variant="outline" type="button" onclick={() => (open = false)} disabled={creating}>
        Cancel
      </Button>
      <Button type="submit" disabled={creating || !name.trim()}>
        {#if creating}
          <Icon icon="solar:refresh-bold-duotone" class="mr-1.5 size-4 animate-spin" />
          Creating...
        {:else}
          <Icon icon="solar:add-circle-bold-duotone" class="mr-1.5 size-4" />
          Create workspace
        {/if}
      </Button>
    </div>
  </form>
</Drawer>
