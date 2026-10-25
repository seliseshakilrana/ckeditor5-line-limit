/**
 * @module line-limit/linelimitconfig
 */

/**
 * The configuration of the {@link module:line-limit/linelimit~LineLimit} plugin.
 *
 * ```ts
 * ClassicEditor
 * 	.create( editorElement, {
 * 		lineLimit: {
 * 			maxLines: 16,
 * 			charsPerLine: 40,
 * 			onUpdate: ( { lineCount, maxLines } ) => {
 * 				counter.textContent = `${ lineCount } / ${ maxLines } lines`;
 * 			}
 * 		}
 * 	} )
 * ```
 */
export interface LineLimitConfig {

	/**
	 * The maximum number of lines in the document. Every block (paragraph, heading, list item, ...) starts a new line,
	 * and every soft break (manual or automatic) starts a new line.
	 *
	 * Omit it (or set it to `0` or `Infinity`) to disable the limit.
	 */
	maxLines?: number;

	/**
	 * The maximum number of characters in a single line. Longer lines are hard-wrapped.
	 *
	 * Omit it (or set it to `0` or `Infinity`) to disable wrapping.
	 */
	charsPerLine?: number;

	/**
	 * A callback executed whenever any of the counts changes. It receives the same data as the
	 * {@link module:line-limit/linelimit~LineLimit#event:update `update`} event.
	 */
	onUpdate?: ( data: LineLimitUpdateData ) => void;
}

/**
 * The data passed to the {@link module:line-limit/linelimit~LineLimit#event:update `update`} event
 * and to the {@link module:line-limit/linelimitconfig~LineLimitConfig#onUpdate `onUpdate`} callback.
 */
export interface LineLimitUpdateData {
	wordCount: number;
	characterCount: number;
	lineCount: number;

	/**
	 * The number (starting at `1`) of the line the selection is in, or `0` when it is not in a text block.
	 */
	currentLine: number;

	/**
	 * The number of characters in the line the selection is in.
	 */
	currentLineCharacterCount: number;
	maxLines: number;
	charsPerLine: number;
}
