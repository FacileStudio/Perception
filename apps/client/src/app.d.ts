declare global {
	namespace App {}

	namespace svelteHTML {
		interface IntrinsicElements {
			'iconify-icon': {
				icon: string;
				width?: string | number;
				height?: string | number;
				class?: string;
				style?: string;
				'aria-hidden'?: boolean | 'true' | 'false';
				'aria-label'?: string;
			};
		}
	}
}

export {};
