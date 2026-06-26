<script lang="ts">
  import { onMount } from 'svelte';

  const apiUrl = import.meta.env.VITE_API_URL ?? '/api';

  onMount(() => {
    const container = document.getElementById('scalar-api');
    if (!container) return;
    const ref = document.createElement('script');
    ref.id = 'api-reference';
    ref.dataset.url = `${apiUrl}/openapi.json`;
    ref.dataset.configuration = JSON.stringify({
      theme: 'kepler',
      hideModels: false,
      hideDownloadButton: false,
    });
    container.appendChild(ref);
    const loader = document.createElement('script');
    loader.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
    container.appendChild(loader);
  });
</script>

<svelte:head>
  <title>Perception API</title>
  <style>
    body { margin: 0; }
  </style>
</svelte:head>

<div id="scalar-api"></div>
