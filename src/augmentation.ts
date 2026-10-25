import type { LineLimit, LineLimitConfig } from './index.js';

declare module '@ckeditor/ckeditor5-core' {
	interface EditorConfig {

		/**
		 * The configuration of the {@link module:line-limit/linelimit~LineLimit} feature.
		 */
		lineLimit?: LineLimitConfig;
	}

	interface PluginsMap {
		[ LineLimit.pluginName ]: LineLimit;
	}
}
