/**
 * @module line-limit/utils
 *
 * Pure text-layout helpers used by the {@link module:line-limit/linelimit~LineLimit} plugin.
 *
 * All functions here operate on a "logical" string representation of a block:
 *
 * * text is kept as-is,
 * * manual soft breaks (<kbd>Shift</kbd>+<kbd>Enter</kbd>) are represented as `\n`,
 * * inline objects (e.g. inline images) are represented as a single `￼` character,
 * * automatic wrap breaks are not present at all.
 */

/**
 * The character used to represent a manual soft break in the logical text of a block.
 */
export const LINE_SEPARATOR = '\n';

/**
 * The character used to represent an inline object in the logical text of a block.
 */
export const OBJECT_REPLACEMENT_CHARACTER = '￼';

const WHITESPACE_REGEXP = /\s/;
const WORD_REGEXP = /(?:[\p{L}\p{N}]+\S?)+/gu;

/**
 * Returns the offsets at which a single line of text (one with no `\n` in it) must be broken so that no
 * line is longer than `charsPerLine`.
 *
 * Rules:
 *
 * * Lines are broken before the first word that does not fit. Whitespace preceding that word stays at the
 *   end of the previous line and does not count towards its length (it "hangs", like in a browser).
 * * Words are never split, unless a single word is longer than `charsPerLine`. Such a word is cut
 *   at exactly `charsPerLine` characters (a surrogate pair is never split, though).
 * * Every returned offset is greater than `0` and lower than `text.length`.
 *
 * @param text A single line of text.
 * @param charsPerLine The maximum number of characters in a line. A non-positive or non-finite value disables wrapping.
 * @returns The sorted offsets at which new lines start.
 */
export function getWrapOffsets( text: string, charsPerLine: number ): Array<number> {
	const offsets: Array<number> = [];

	if ( !isLimitEnabled( charsPerLine ) || text.length <= charsPerLine ) {
		return offsets;
	}

	let lineStart = 0;
	let lineHasWord = false;
	let position = 0;

	while ( position < text.length ) {
		if ( isWhitespace( text[ position ] ) ) {
			position++;

			continue;
		}

		const wordStart = position;

		while ( position < text.length && !isWhitespace( text[ position ] ) ) {
			position++;
		}

		if ( position - lineStart > charsPerLine ) {
			// Move the whole word to a new line if there is something before it in the current line.
			if ( lineHasWord ) {
				lineStart = wordStart;
				offsets.push( lineStart );
			}

			// The word alone is still too long, so hard-cut it.
			while ( position - lineStart > charsPerLine ) {
				let cut = lineStart + charsPerLine;

				// Do not split a surrogate pair (e.g. an emoji). A single code point always fits when `charsPerLine` > 1.
				if ( isLowSurrogate( text.charCodeAt( cut ) ) && cut - 1 > lineStart ) {
					cut--;
				}

				lineStart = cut;
				offsets.push( lineStart );
			}
		}

		lineHasWord = true;
	}

	return offsets;
}

/**
 * Returns the offsets at which automatic wrap breaks must be placed in the logical text of a block.
 * Manual soft breaks (`\n`) always start a new line, so the text between them is wrapped independently.
 *
 * @param text The logical text of a block (may contain `\n` for manual soft breaks).
 * @param charsPerLine The maximum number of characters in a line.
 * @returns The sorted offsets (in the logical text) at which new lines start.
 */
export function getBlockWrapOffsets( text: string, charsPerLine: number ): Array<number> {
	const offsets: Array<number> = [];
	let lineStart = 0;

	for ( const line of text.split( LINE_SEPARATOR ) ) {
		for ( const offset of getWrapOffsets( line, charsPerLine ) ) {
			offsets.push( lineStart + offset );
		}

		lineStart += line.length + LINE_SEPARATOR.length;
	}

	return offsets;
}

/**
 * Returns the number of lines the logical text of a block takes after wrapping.
 *
 * An empty text still takes one line.
 *
 * @param text The logical text of a block (may contain `\n` for manual soft breaks).
 * @param charsPerLine The maximum number of characters in a line.
 */
export function countLines( text: string, charsPerLine: number ): number {
	return text.split( LINE_SEPARATOR ).length + getBlockWrapOffsets( text, charsPerLine ).length;
}

/**
 * Returns the number of words in the given text.
 *
 * @param text Any text.
 */
export function countWords( text: string ): number {
	return ( text.match( WORD_REGEXP ) || [] ).length;
}

/**
 * Returns the number of characters (Unicode code points) in the given text.
 *
 * @param text Any text.
 */
export function countCharacters( text: string ): number {
	return Array.from( text ).length;
}

/**
 * Checks whether a limit value means "limit enabled", i.e. it is a positive, finite number.
 *
 * @param value The limit value.
 */
export function isLimitEnabled( value: number ): boolean {
	return Number.isFinite( value ) && value > 0;
}

function isWhitespace( character: string ): boolean {
	return WHITESPACE_REGEXP.test( character );
}

function isLowSurrogate( charCode: number ): boolean {
	return charCode >= 0xDC00 && charCode <= 0xDFFF;
}
