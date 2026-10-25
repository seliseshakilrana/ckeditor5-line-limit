/**
 * @module line-limit/linelimitcounterview
 */

import { View, type Locale } from 'ckeditor5';

/**
 * A toolbar item that shows the counts, e.g. "L: 3/16   W: 19   Char(s): 30":
 *
 * * `L` – the number of the line with the cursor and the line limit,
 * * `W` – the number of words in the document,
 * * `Char(s)` – the number of characters in the line with the cursor.
 *
 * It is not focusable, so it is skipped when navigating the toolbar with the keyboard.
 */
export default class LineLimitCounterView extends View {
	/**
	 * The number of lines in the document.
	 *
	 * @observable
	 */
	declare public lineCount: number;

	/**
	 * The number of the line with the cursor (`0` when the cursor is not in a text block).
	 *
	 * @observable
	 */
	declare public currentLine: number;

	/**
	 * The maximum number of lines (`0` when there is no limit).
	 *
	 * @observable
	 */
	declare public maxLines: number;

	/**
	 * The number of words in the document.
	 *
	 * @observable
	 */
	declare public wordCount: number;

	/**
	 * The number of characters in the line with the cursor.
	 *
	 * @observable
	 */
	declare public currentLineCharacterCount: number;

	/**
	 * Whether the number of lines reached the limit.
	 *
	 * @observable
	 */
	declare public isFull: boolean;

	constructor( locale: Locale ) {
		super( locale );

		const t = locale.t;
		const bind = this.bindTemplate;

		this.set( {
			lineCount: 0,
			currentLine: 0,
			maxLines: 0,
			wordCount: 0,
			currentLineCharacterCount: 0
		} );

		this.bind( 'isFull' ).to( this, 'lineCount', this, 'maxLines', ( lineCount, maxLines ) => !!maxLines && lineCount >= maxLines );

		this.setTemplate( {
			tag: 'div',
			attributes: {
				class: [
					'ck',
					'ck-line-limit-counter',
					bind.if( 'isFull', 'ck-line-limit-counter_full' )
				]
			},
			children: [
				{
					tag: 'span',
					attributes: {
						class: [ 'ck-line-limit-counter__lines' ],
						title: t( 'Current line' )
					},
					children: [ {
						text: [ bind.to( 'currentLine', currentLine => {
							// E.g. when an image is selected.
							const line = currentLine || '-';

							return this.maxLines ? t( 'L: %0/%1', [ line, this.maxLines ] ) : t( 'L: %0', line );
						} ) ]
					} ]
				},
				{
					tag: 'span',
					attributes: {
						class: [ 'ck-line-limit-counter__words' ],
						title: t( 'Words' )
					},
					children: [ {
						text: [ bind.to( 'wordCount', wordCount => t( 'W: %0', wordCount ) ) ]
					} ]
				},
				{
					tag: 'span',
					attributes: {
						class: [ 'ck-line-limit-counter__characters' ],
						title: t( 'Characters in the current line' )
					},
					children: [ {
						text: [ bind.to( 'currentLineCharacterCount', count => t( 'Char(s): %0', count ) ) ]
					} ]
				}
			]
		} );
	}
}
