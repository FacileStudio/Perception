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

  const capabilities = [
    {
      icon: 'solar:chat-round-dots-bold-duotone',
      title: 'Grounded chat',
      description: 'Ask in plain language. Answers cite real events, not hallucinations — powered by hybrid retrieval across vector, full-text, SQL, entity, and knowledge graph lanes.',
    },
    {
      icon: 'solar:graph-new-bold-duotone',
      title: 'Entity intelligence',
      description: 'Automatic entity resolution across providers. Cross-reference clients, projects, contracts, and services into a unified knowledge graph with community detection.',
    },
    {
      icon: 'solar:telescope-bold-duotone',
      title: 'Predictive forecasting',
      description: 'Bayesian belief forecasting with calibrated confidence scores, conformal prediction intervals, and ensemble aggregation. The system scores itself and improves.',
    },
    {
      icon: 'solar:pulse-2-bold-duotone',
      title: 'Change point detection',
      description: 'Bayesian Online Change Point Detection surfaces regime shifts in real time. Granger causality reveals which events actually drive downstream effects.',
    },
    {
      icon: 'solar:bell-bing-bold-duotone',
      title: 'Proactive alerts',
      description: 'Anomaly detection, velocity spikes, client silence, and actor absence — surfaced automatically before you think to ask.',
    },
    {
      icon: 'solar:branching-paths-up-bold-duotone',
      title: 'Counterfactual simulation',
      description: 'Ask "what if" questions. Monte Carlo simulations propagate through causal graphs to show how changes ripple across your operations.',
    },
    {
      icon: 'solar:documents-bold-duotone',
      title: 'Document knowledge base',
      description: 'Upload PDFs, markdown, and text files. Chunked, embedded, and woven into retrieval alongside live operational data.',
    },
    {
      icon: 'solar:hand-shake-bold-duotone',
      title: 'Action proposals',
      description: 'Perception identifies gaps and proposes write-back actions to source systems — task creation, client tagging, contract annotation — with one-click approval.',
    },
    {
      icon: 'solar:shield-check-bold-duotone',
      title: 'Self-correcting retrieval',
      description: 'Corrective RAG detects sparse context and retries with relaxed queries. Outcome-guided learning tunes retrieval weights from your feedback.',
    },
  ];

  const stats = [
    { value: '12+', label: 'retrieval lanes' },
    { value: '10+', label: 'background workers' },
    { value: '0', label: 'telemetry sent' },
  ];
</script>

<svelte:head>
  <title>Perception — Operational Intelligence</title>
  <meta name="description" content="Operational intelligence that explains the past, detects the present, and forecasts the future. Self-hosted. AI-powered. Grounded in your data." />
</svelte:head>

{#if !redirecting}
<div class="min-h-screen bg-background text-foreground">
  <header class="border-b border-border">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
    <section class="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
      <p class="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-zinc-50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
        <Icon icon="solar:shield-check-bold-duotone" class="size-3.5" />
        Self-hosted &middot; No telemetry &middot; Your data stays yours
      </p>
      <h1 class="font-[Goga] text-5xl tracking-tight md:text-6xl">
        Operational intelligence<br />
        <span class="text-muted-foreground">that thinks ahead.</span>
      </h1>
      <p class="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
        Perception ingests events from your entire stack, builds a living knowledge graph, detects anomalies with statistical rigor, and forecasts what happens next — all grounded in evidence, not guesswork.
      </p>
      <div class="mt-10 flex justify-center gap-3">
        <Button size="lg" href="/login">
          Get started
          <Icon icon="solar:arrow-right-bold" class="ml-2 size-4" />
        </Button>
      </div>
    </section>

    <Separator />

    <section class="mx-auto max-w-6xl px-6 py-16">
      <div class="mb-12 text-center">
        <h2 class="font-[Goga] text-3xl tracking-tight">From raw events to actionable foresight.</h2>
        <p class="mt-3 text-muted-foreground">Every layer builds on the last. No black boxes.</p>
      </div>

      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {#each capabilities as cap}
          <Card class="group p-6 transition-colors hover:bg-zinc-50/80">
            <div class="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-white transition-colors group-hover:border-zinc-300">
              <Icon icon={cap.icon} class="size-5 text-zinc-700" />
            </div>
            <p class="font-semibold text-foreground">{cap.title}</p>
            <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {cap.description}
            </p>
          </Card>
        {/each}
      </div>
    </section>

    <Separator />

    <section class="mx-auto max-w-6xl px-6 py-16">
      <div class="grid gap-8 md:grid-cols-3">
        {#each stats as stat}
          <div class="text-center">
            <p class="font-[Goga] text-4xl tracking-tight">{stat.value}</p>
            <p class="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </div>
        {/each}
      </div>
    </section>

    <Separator />

    <section class="mx-auto max-w-6xl px-6 py-16">
      <div class="grid items-center gap-10 md:grid-cols-2">
        <div>
          <h2 class="font-[Goga] text-3xl tracking-tight">Built on math,<br />not magic.</h2>
          <p class="mt-4 text-muted-foreground leading-relaxed">
            BOCPD for change point detection. Granger causality for causal inference. Conformal prediction for distribution-free uncertainty bounds. Brier scoring for calibration tracking. Louvain for community detection. Persistent homology for knowledge gap analysis. Every prediction carries provenance and a calibration-aware confidence score.
          </p>
        </div>
        <div class="space-y-3">
          <div class="flex items-start gap-3 rounded-lg border border-border p-4">
            <Icon icon="solar:chart-bold-duotone" class="mt-0.5 size-5 shrink-0 text-zinc-500" />
            <div>
              <p class="text-sm font-medium">Calibration dashboard</p>
              <p class="mt-0.5 text-xs text-muted-foreground">Reliability diagrams, Brier decomposition, per-domain accuracy breakdown.</p>
            </div>
          </div>
          <div class="flex items-start gap-3 rounded-lg border border-border p-4">
            <Icon icon="solar:tuning-2-bold-duotone" class="mt-0.5 size-5 shrink-0 text-zinc-500" />
            <div>
              <p class="text-sm font-medium">Ensemble strategies</p>
              <p class="mt-0.5 text-xs text-muted-foreground">Multiple forecasting methods compete. Track-record weighting evolves the best mix.</p>
            </div>
          </div>
          <div class="flex items-start gap-3 rounded-lg border border-border p-4">
            <Icon icon="solar:target-bold-duotone" class="mt-0.5 size-5 shrink-0 text-zinc-500" />
            <div>
              <p class="text-sm font-medium">Conformal intervals</p>
              <p class="mt-0.5 text-xs text-muted-foreground">Distribution-free prediction intervals with guaranteed coverage. Honest uncertainty.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <Separator />

    <section class="mx-auto max-w-6xl px-6 py-20 text-center">
      <h2 class="font-[Goga] text-3xl tracking-tight">
        Ready to see clearly?
      </h2>
      <p class="mt-4 text-muted-foreground">
        Deploy on your infrastructure. Connect your event sources. Start asking questions.
      </p>
      <Button class="mt-8" size="lg" href="/login">
        Sign in
        <Icon icon="solar:arrow-right-bold" class="ml-2 size-4" />
      </Button>
    </section>
  </main>

  <footer class="border-t border-border text-center text-muted">
    <div class="mx-auto max-w-6xl px-6 py-6 text-sm text-muted-foreground">
      &copy; {new Date().getFullYear()} Perception by <a href="https://facile.studio" class="font-semibold underline hover:cursor-pointer">Facile.</a>
    </div>
  </footer>
</div>
{/if}
