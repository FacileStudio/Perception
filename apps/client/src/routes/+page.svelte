<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth, checkAuth } from '$lib/stores';
  import { Button } from '$lib/components/ui/button';
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
  <meta name="description" content="Operational intelligence that explains the past, detects the present, and forecasts the future." />
</svelte:head>

{#if !redirecting}
<div class="min-h-screen bg-background text-foreground">
  <header class="border-b border-border">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
      <PerceptionLogo iconSizeClass="size-6" iconFrameClass="size-6" titleClass="text-xl font-bold" class="gap-2" />
      <Button href="/login">
        Sign in
        <Icon icon="solar:login-3-linear" class="ml-1.5 size-4" />
      </Button>
    </div>
  </header>

  <main>

    <section class="mx-auto max-w-5xl px-6 py-28 md:py-36">
      <p class="mb-5 inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1 text-xs text-muted-foreground">
        <Icon icon="solar:lock-keyhole-linear" class="size-3" />
        Self-hosted &middot; Zero telemetry
      </p>
      <h1 class="max-w-3xl font-[Goga] text-5xl leading-[1.08] tracking-tight md:text-6xl">
        Operational intelligence<br class="hidden sm:block" />
        that thinks ahead.
      </h1>
      <p class="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
        Ingest events from your stack. Build a living knowledge graph. Detect anomalies. Forecast what happens next — grounded in evidence, not guesswork.
      </p>
      <Button class="mt-10" size="lg" href="/login">
        Get started
        <Icon icon="solar:arrow-right-linear" class="ml-2 size-4" />
      </Button>
    </section>

    <section class="border-y border-border bg-muted/60">
      <div class="mx-auto grid max-w-5xl divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
        {#each [
          { icon: 'solar:chat-round-dots-linear', title: 'Ask anything', text: 'Hybrid retrieval across twelve lanes — vector, full-text, SQL, entity graph, knowledge communities — so answers cite real evidence.' },
          { icon: 'solar:graph-new-linear', title: 'See connections', text: 'Automatic entity resolution and community detection build a knowledge graph that links clients, projects, contracts, and services across providers.' },
          { icon: 'solar:telescope-linear', title: 'Predict outcomes', text: 'Bayesian forecasting with calibrated confidence, conformal prediction intervals, and ensemble strategies that score themselves and improve.' },
        ] as pillar}
          <div class="px-6 py-10 md:py-14">
            <Icon icon={pillar.icon} class="mb-4 size-6 text-muted-foreground" />
            <p class="text-base font-semibold">{pillar.title}</p>
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.text}</p>
          </div>
        {/each}
      </div>
    </section>

    <section class="mx-auto max-w-5xl px-6 py-24">
      <div class="grid items-start gap-16 md:grid-cols-2">
        <div class="md:sticky md:top-24">
          <h2 class="font-[Goga] text-3xl tracking-tight">Built on math,<br />not magic.</h2>
          <p class="mt-4 max-w-md leading-relaxed text-muted-foreground">
            Every prediction carries provenance and a calibration-aware confidence score.
            No black boxes — deterministic algorithms you can audit.
          </p>
        </div>
        <dl class="space-y-8">
          {#each [
            { term: 'Change point detection', def: 'BOCPD surfaces regime shifts the moment they happen. Not after the postmortem.' },
            { term: 'Causal inference', def: 'Granger causality on event co-occurrence reveals which signals actually drive downstream effects.' },
            { term: 'Calibration tracking', def: 'Brier scoring, reliability diagrams, and isotonic recalibration. A 70% prediction comes true ~70% of the time.' },
            { term: 'Conformal intervals', def: 'Distribution-free prediction bounds with guaranteed coverage. Honest about what it doesn\'t know.' },
            { term: 'Knowledge gap detection', def: 'Persistent homology over the entity graph finds structural blind spots in your operational data.' },
          ] as item}
            <div>
              <dt class="text-sm font-semibold">{item.term}</dt>
              <dd class="mt-1 text-sm leading-relaxed text-muted-foreground">{item.def}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </section>

    <section class="border-y border-border bg-muted/60">
      <div class="mx-auto max-w-5xl px-6 py-20">
        <h2 class="mb-10 font-[Goga] text-3xl tracking-tight">And the rest.</h2>
        <div class="grid gap-x-16 gap-y-5 sm:grid-cols-2">
          {#each [
            { icon: 'solar:bell-bing-linear', label: 'Proactive anomaly alerts' },
            { icon: 'solar:branching-paths-up-linear', label: 'Counterfactual what-if simulation' },
            { icon: 'solar:documents-linear', label: 'Document knowledge base' },
            { icon: 'solar:hand-shake-linear', label: 'Write-back action proposals' },
            { icon: 'solar:shield-check-linear', label: 'Self-correcting retrieval (CRAG)' },
            { icon: 'solar:database-linear', label: 'Natural language to SQL' },
            { icon: 'solar:history-linear', label: 'Persistent conversational memory' },
            { icon: 'solar:code-scan-linear', label: 'Temporal diff queries' },
          ] as feat}
            <div class="flex items-center gap-3 py-1.5">
              <Icon icon={feat.icon} class="size-4 shrink-0 text-muted-foreground" />
              <span class="text-sm">{feat.label}</span>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-5xl px-6 py-24 text-center">
      <h2 class="font-[Goga] text-3xl tracking-tight">Ready to see clearly?</h2>
      <p class="mt-3 text-muted-foreground">
        Deploy on your infrastructure. Connect your sources. Start asking.
      </p>
      <Button class="mt-8" size="lg" href="/login">
        Sign in
        <Icon icon="solar:arrow-right-linear" class="ml-2 size-4" />
      </Button>
    </section>
  </main>

  <footer class="border-t border-border">
    <div class="mx-auto max-w-5xl px-6 py-6 text-center text-sm text-muted-foreground">
      &copy; {new Date().getFullYear()} Perception by <a href="https://facile.studio" class="font-semibold underline hover:cursor-pointer">Facile.</a>
    </div>
  </footer>
</div>
{/if}
