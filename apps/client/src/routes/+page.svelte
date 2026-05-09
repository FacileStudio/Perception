<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth, checkAuth } from '$lib/stores';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
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
      <PerceptionLogo iconSizeClass="size-6" iconFrameClass="size-10" titleClass="text-xl font-bold" />
      <div class="flex items-center gap-2">
        <Button href="/login">Sign in</Button>
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
        <Card.Root class="border border-border">
          <Card.Header>
            <div class="mb-2 flex size-10 items-center justify-center rounded-md border border-border">
              <Icon icon="solar:eye-bold-duotone" class="size-5" />
            </div>
            <Card.Title>Contextual memory</Card.Title>
            <Card.Description>
              Ingests events, incidents, and alerts from your stack and indexes them as a living operational record.
            </Card.Description>
          </Card.Header>
        </Card.Root>

        <Card.Root class="border border-border">
          <Card.Header>
            <div class="mb-2 flex size-10 items-center justify-center rounded-md border border-border">
              <Icon icon="solar:chat-round-dots-bold-duotone" class="size-5" />
            </div>
            <Card.Title>AI-powered queries</Card.Title>
            <Card.Description>
              Ask in plain language. Get answers grounded in your actual history — not model hallucinations.
            </Card.Description>
          </Card.Header>
        </Card.Root>

        <Card.Root class="border border-border">
          <Card.Header>
            <div class="mb-2 flex size-10 items-center justify-center rounded-md border border-border">
              <Icon icon="solar:graph-new-bold-duotone" class="size-5" />
            </div>
            <Card.Title>Signal over noise</Card.Title>
            <Card.Description>
              Cuts through the alert fog. Delivery drift, recurring failures, and team patterns surfaced automatically.
            </Card.Description>
          </Card.Header>
        </Card.Root>
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
