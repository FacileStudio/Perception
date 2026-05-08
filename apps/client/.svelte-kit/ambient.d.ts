
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const SHELL: string;
	export const npm_command: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const WINDOWID: string;
	export const REDIS_URL: string;
	export const COLORTERM: string;
	export const XPC_FLAGS: string;
	export const TERM_PROGRAM_VERSION: string;
	export const DATABASE_URL: string;
	export const TMUX: string;
	export const FPATH: string;
	export const NODE: string;
	export const __CFBundleIdentifier: string;
	export const CURRENT_PROJECT: string;
	export const SSH_AUTH_SOCK: string;
	export const ANTHROPIC_API_KEY: string;
	export const TMUX_PLUGIN_MANAGER_PATH: string;
	export const OSLogRateLimit: string;
	export const OPENAI_API_KEY: string;
	export const npm_config_local_prefix: string;
	export const KNOT_SPACE_URL: string;
	export const HOMEBREW_PREFIX: string;
	export const KITTY_PID: string;
	export const EDITOR: string;
	export const GOBIN: string;
	export const is_vim: string;
	export const PWD: string;
	export const LOGNAME: string;
	export const MANPATH: string;
	export const LINEAR_API_KEY: string;
	export const LaunchInstanceID: string;
	export const _: string;
	export const KITTY_PUBLIC_KEY: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const BRAIN: string;
	export const KNOT_TOKEN: string;
	export const CLAUDECODE: string;
	export const API_KEY: string;
	export const COMMAND_MODE: string;
	export const HOME: string;
	export const LANG: string;
	export const npm_package_version: string;
	export const SECURITYSESSIONID: string;
	export const STARSHIP_SHELL: string;
	export const __MISE_DIFF: string;
	export const KITTY_WINDOW_ID: string;
	export const TMPDIR: string;
	export const LINEAR_ISSUE_SORT: string;
	export const NTFY_SH: string;
	export const GOROOT: string;
	export const __MISE_SHIM: string;
	export const STARSHIP_SESSION_KEY: string;
	export const __MISE_ORIG_PATH: string;
	export const INFOPATH: string;
	export const npm_lifecycle_script: string;
	export const SCRIPTS: string;
	export const TERMINFO: string;
	export const TERM: string;
	export const npm_package_name: string;
	export const __MISE_ZSH_PRECMD_RUN: string;
	export const USER: string;
	export const TMUX_PANE: string;
	export const HOMEBREW_CELLAR: string;
	export const __MISE_SESSION: string;
	export const MANPAGER: string;
	export const npm_lifecycle_event: string;
	export const SHLVL: string;
	export const GIT_EDITOR: string;
	export const BW_SESSION: string;
	export const HOMEBREW_REPOSITORY: string;
	export const XPC_SERVICE_NAME: string;
	export const npm_config_user_agent: string;
	export const OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
	export const npm_execpath: string;
	export const KITTY_LISTEN_ON: string;
	export const MIX_HOME: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const npm_package_json: string;
	export const LINEAR_TEAM_ID: string;
	export const MISE_SHELL: string;
	export const GCC_COLORS: string;
	export const CLAUDE_CODE_EXECPATH: string;
	export const PATH: string;
	export const HOMEBREW_CASK_OPTS: string;
	export const FZF_DEFAULT_OPTS: string;
	export const MARCEL_TOKEN: string;
	export const MIX_ARCHIVES: string;
	export const KITTY_INSTALLATION_DIR: string;
	export const npm_node_execpath: string;
	export const TLDR_AUTO_UPDATE_DISABLED: string;
	export const is_fzf: string;
	export const OLDPWD: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const TERM_PROGRAM: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		SHELL: string;
		npm_command: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		WINDOWID: string;
		REDIS_URL: string;
		COLORTERM: string;
		XPC_FLAGS: string;
		TERM_PROGRAM_VERSION: string;
		DATABASE_URL: string;
		TMUX: string;
		FPATH: string;
		NODE: string;
		__CFBundleIdentifier: string;
		CURRENT_PROJECT: string;
		SSH_AUTH_SOCK: string;
		ANTHROPIC_API_KEY: string;
		TMUX_PLUGIN_MANAGER_PATH: string;
		OSLogRateLimit: string;
		OPENAI_API_KEY: string;
		npm_config_local_prefix: string;
		KNOT_SPACE_URL: string;
		HOMEBREW_PREFIX: string;
		KITTY_PID: string;
		EDITOR: string;
		GOBIN: string;
		is_vim: string;
		PWD: string;
		LOGNAME: string;
		MANPATH: string;
		LINEAR_API_KEY: string;
		LaunchInstanceID: string;
		_: string;
		KITTY_PUBLIC_KEY: string;
		NoDefaultCurrentDirectoryInExePath: string;
		BRAIN: string;
		KNOT_TOKEN: string;
		CLAUDECODE: string;
		API_KEY: string;
		COMMAND_MODE: string;
		HOME: string;
		LANG: string;
		npm_package_version: string;
		SECURITYSESSIONID: string;
		STARSHIP_SHELL: string;
		__MISE_DIFF: string;
		KITTY_WINDOW_ID: string;
		TMPDIR: string;
		LINEAR_ISSUE_SORT: string;
		NTFY_SH: string;
		GOROOT: string;
		__MISE_SHIM: string;
		STARSHIP_SESSION_KEY: string;
		__MISE_ORIG_PATH: string;
		INFOPATH: string;
		npm_lifecycle_script: string;
		SCRIPTS: string;
		TERMINFO: string;
		TERM: string;
		npm_package_name: string;
		__MISE_ZSH_PRECMD_RUN: string;
		USER: string;
		TMUX_PANE: string;
		HOMEBREW_CELLAR: string;
		__MISE_SESSION: string;
		MANPAGER: string;
		npm_lifecycle_event: string;
		SHLVL: string;
		GIT_EDITOR: string;
		BW_SESSION: string;
		HOMEBREW_REPOSITORY: string;
		XPC_SERVICE_NAME: string;
		npm_config_user_agent: string;
		OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
		npm_execpath: string;
		KITTY_LISTEN_ON: string;
		MIX_HOME: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		npm_package_json: string;
		LINEAR_TEAM_ID: string;
		MISE_SHELL: string;
		GCC_COLORS: string;
		CLAUDE_CODE_EXECPATH: string;
		PATH: string;
		HOMEBREW_CASK_OPTS: string;
		FZF_DEFAULT_OPTS: string;
		MARCEL_TOKEN: string;
		MIX_ARCHIVES: string;
		KITTY_INSTALLATION_DIR: string;
		npm_node_execpath: string;
		TLDR_AUTO_UPDATE_DISABLED: string;
		is_fzf: string;
		OLDPWD: string;
		__CF_USER_TEXT_ENCODING: string;
		TERM_PROGRAM: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
