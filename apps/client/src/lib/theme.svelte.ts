import { browser } from '$app/environment';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'perception.theme';

function isPreference(value: string | null): value is ThemePreference {
	return value === 'light' || value === 'dark' || value === 'system';
}

class ThemeState {
	preference = $state<ThemePreference>('system');
	resolved = $state<'light' | 'dark'>('light');

	/** Reads the stored preference and starts tracking the OS setting. */
	restore() {
		if (!browser) return;

		const stored = localStorage.getItem(STORAGE_KEY);
		this.preference = isPreference(stored) ? stored : 'system';
		this.apply();

		const query = window.matchMedia('(prefers-color-scheme: dark)');
		query.addEventListener('change', () => {
			if (this.preference === 'system') this.apply();
		});
	}

	set(next: ThemePreference) {
		this.preference = next;
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, next);
		this.apply();
	}

	private apply() {
		if (!browser) return;
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const dark = this.preference === 'dark' || (this.preference === 'system' && prefersDark);
		this.resolved = dark ? 'dark' : 'light';
		document.documentElement.classList.toggle('dark', dark);
	}
}

export const theme = new ThemeState();
