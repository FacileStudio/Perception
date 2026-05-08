import { addCollection } from '@iconify/svelte';
import { icons as solarIcons } from '@iconify-json/solar';

let loaded = false;

export function ensureSolar() {
  if (loaded) return;
  addCollection(solarIcons);
  loaded = true;
}
