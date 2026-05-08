<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { twMerge } from 'tailwind-merge';

  type Variant = 'default' | 'outline' | 'ghost' | 'destructive';
  type Size = 'default' | 'sm' | 'lg' | 'icon';

  let {
    variant = 'default',
    size = 'default',
    class: className = '',
    disabled = false,
    onclick,
    children,
    ...rest
  }: HTMLButtonAttributes & { variant?: Variant; size?: Size } = $props();

  const base = 'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 disabled:pointer-events-none disabled:opacity-50';
  const variants: Record<Variant, string> = {
    default: 'bg-zinc-900 text-white hover:bg-zinc-800',
    outline: 'border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900',
    ghost: 'hover:bg-zinc-100 text-zinc-900',
    destructive: 'bg-zinc-900 text-white hover:bg-zinc-800',
  };
  const sizes: Record<Size, string> = {
    default: 'h-9 px-4 py-2 text-sm rounded-md',
    sm: 'h-7 px-3 text-xs rounded-md',
    lg: 'h-11 px-6 text-base rounded-md',
    icon: 'h-9 w-9 rounded-md',
  };

  const computedClass = twMerge(base, variants[variant], sizes[size], className);
</script>

<button
  class={computedClass}
  {disabled}
  {onclick}
  {...rest}
>
  {@render children?.()}
</button>
