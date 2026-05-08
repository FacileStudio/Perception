<script lang="ts">
  type Variant = 'default' | 'outline' | 'secondary';
  let { variant = 'default', class: className = '', children }: { variant?: Variant; class?: string; children?: any } = $props();
  const variants: Record<Variant, string> = {
    default: 'bg-zinc-900 text-white',
    outline: 'border border-zinc-200 text-zinc-900',
    secondary: 'bg-zinc-100 text-zinc-900',
  };
</script>

<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {variants[variant]} {className}">
  {@render children?.()}
</span>
