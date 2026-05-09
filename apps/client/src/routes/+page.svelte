<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth, checkAuth } from '$lib/stores';
  import { Button } from '$lib/components/ui/button';
  import { Card } from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import PerceptionLogo from '$lib/components/perception-logo.svelte';
  import { ensureSolar } from '$lib/solar';
  import Icon from '@iconify/svelte';

  ensureSolar();

  let redirecting = $state(true);

  onMount(async () => {
    await checkAuth();
    if (auth.authenticated) {
      goto('/chat');
      return;
    }
    redirecting = false;
  });
</script>

<svelte:head>
  <title>Perception — Operational Intelligence</title>
  <meta name="description" content="Interrogate the noise. AI-powered memory for engineering teams." />
</svelte:head>

{#if !redirecting}
<div class="min-h-screen bg-background text-foreground">
  <header class="border-b border-border">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
      <PerceptionLogo iconSizeClass="size-6" iconFrameClass="size-6" titleClass="text-xl font-bold" class="gap-2" />
      <div class="flex items-center gap-2">
        <Button href="/login">
          Sign in
          <Icon icon="solar:login-3-bold" class="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  </header>

  <main>
    <section class="mx-auto max-w-5xl px-6 py-24 text-center">
      <h1 class="font-[Goga] text-5xl tracking-tight">
        Interrogate the noise.
      </h1>
      <p class="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
        Perception is your team's operational memory. Ask questions about incidents, deployments,
        and delivery drift — and get answers grounded in real context, not folklore.
      </p>
      <div class="mt-10 flex justify-center gap-3">
        <Button size="lg" href="/login">
          Get started
          <Icon icon="solar:arrow-right-bold" class="ml-2 size-4" />
        </Button>
      </div>
    </section>

    <Separator />

    <section class="mx-auto max-w-5xl px-6 py-20">
      <div class="grid gap-6 md:grid-cols-3">
        <Card class="p-6">
          <div class="mb-3 flex size-10 items-center justify-center rounded-md border border-border">
            <Icon icon="solar:eye-bold-duotone" class="size-5" />
          </div>
          <p class="font-semibold text-foreground">Contextual memory</p>
          <p class="mt-1.5 text-sm text-muted-foreground">
            Ingests events, incidents, and alerts from your stack and indexes them as a living operational record.
          </p>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex size-10 items-center justify-center rounded-md border border-border">
            <Icon icon="solar:chat-round-dots-bold-duotone" class="size-5" />
          </div>
          <p class="font-semibold text-foreground">AI-powered queries</p>
          <p class="mt-1.5 text-sm text-muted-foreground">
            Ask in plain language. Get answers grounded in your actual history — not model hallucinations.
          </p>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex size-10 items-center justify-center rounded-md border border-border">
            <Icon icon="solar:graph-new-bold-duotone" class="size-5" />
          </div>
          <p class="font-semibold text-foreground">Signal over noise</p>
          <p class="mt-1.5 text-sm text-muted-foreground">
            Cuts through the alert fog. Delivery drift, recurring failures, and team patterns surfaced automatically.
          </p>
        </Card>
      </div>
    </section>

    <Separator />

    <section class="mx-auto max-w-5xl px-6 py-20 text-center">
      <h2 class="font-[Goga] text-3xl tracking-tight">
        Ready to see clearly?
      </h2>
      <p class="mt-4 text-muted-foreground">
        Self-hosted. No telemetry. Your data stays yours.
      </p>
      <Button class="mt-8" size="lg" href="/login">
        Sign in
        <Icon icon="solar:arrow-right-bold" class="ml-2 size-4" />
      </Button>
    </section>
  </main>

  <footer class="border-t border-border text-center text-muted">
    <div class="mx-auto max-w-5xl px-6 py-6 text-sm text-muted-foreground">
      © {new Date().getFullYear()} Perception by <a href="https://facile.studio" class="underline hover:cursor-pointer font-semibold">Facile.</a>
    </div>
  </footer>
</div>
{/if}
