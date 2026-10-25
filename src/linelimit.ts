/**
 * @module line-limit/linelimit
 */

import {
	Plugin,
	ShiftEnter,
	type Editor,
	type Locale,
	type ModelDocumentSelection,
	type ModelElement,
	type ModelItem,
	type ModelNode,
	type ModelPosition,
	type ModelRange,
	type ModelSelection,
	type ModelWriter
} from 'ckeditor5';

import type { LineLimitUpdateData } from './linelimitconfig.js';
import LineLimitCounterView from './linelimitcounterview.js';
import {
	LINE_SEPARATOR,
	OBJECT_REPLACEMENT_CHARACTER,
	countCharacters,
	countLines,
	countWords,
	getBlockWrapOffsets,
	isLimitEnabled
} from './utils.js';

import '../theme/index-editor.css';

/**
 * The name of the model element used for line breaks inserted automatically by the word wrap.
 *
 * It is a soft break (`<br>`) marked as automatic. A dedicated element is used rather than an attribute
 * on `softBreak`, because the `ShiftEnter` plugin strips `softBreak` attributes that differ from the following text.
 */
export const AUTO_WRAP_ELEMENT = 'autoWrapBreak';

/**
 * The name of the view attribute that marks soft breaks inserted automatically by the word wrap
 * (`<br data-auto-wrap="true">`).
 */
export const AUTO_WRAP_VIEW_ATTRIBUTE = 'data-auto-wrap';

/**
 * How many times the post-fixer may modify the document in a single change block. It only kicks in when another
 * post-fixer keeps re-adding content the line limit removes (e.g. a table cell that must contain a paragraph).
 */
const MAX_POST_FIXER_PASSES = 10;

/**
 * The line limit feature.
 *
 * * Hard-wraps lines longer than `lineLimit.charsPerLine` by inserting soft breaks marked as automatic
 *   (`autoWrapBreak` in the model, `<br data-auto-wrap="true">` in the view).
 *   Those breaks are recalculated after every change, so the text re-flows when it is edited.
 * * Keeps the number of lines at or below `lineLimit.maxLines`. Typing and <kbd>Enter</kbd> are blocked when they would
 *   exceed the limit and anything else (e.g. pasted content) is trimmed.
 * * Exposes observable {@link #wordCount}, {@link #characterCount}, {@link #lineCount}, {@link #currentLine} and
 *   {@link #currentLineCharacterCount} properties and fires the {@link #event:update `update`} event when they change.
 * * Registers the `'lineLimit'` toolbar component, which shows those counts at the end of the toolbar.
 *
 * All wrapping and trimming happens in a single model post-fixer, so it always lands in the same batch
 * (and the same undo step) as the change that caused it.
 */
export default class LineLimit extends Plugin {
	/**
	 * The number of words in the document.
	 *
	 * @observable
	 * @readonly
	 */
	declare public wordCount: number;

	/**
	 * The number of characters in the document. Line breaks are not counted.
	 *
	 * @observable
	 * @readonly
	 */
	declare public characterCount: number;

	/**
	 * The number of lines in the document, including the lines created by the automatic word wrap.
	 *
	 * @observable
	 * @readonly
	 */
	declare public lineCount: number;

	/**
	 * The number of characters in the line the selection (its focus) is in. Line breaks are not counted.
	 * It is `0` when the selection is not in a text block.
	 *
	 * @observable
	 * @readonly
	 */
	declare public currentLineCharacterCount: number;

	/**
	 * The number (starting at `1`) of the line the selection (its focus) is in, counting all lines of the document,
	 * including the lines created by the automatic word wrap. It is `0` when the selection is not in a text block.
	 *
	 * @observable
	 * @readonly
	 */
	declare public currentLine: number;

	/**
	 * How many times the post-fixer modified the document in the current change block.
	 */
	private _postFixerPasses = 0;

	public static get pluginName(): 'LineLimit' {
		return 'LineLimit' as const;
	}

	public static get requires(): readonly [ typeof ShiftEnter ] {
		return [ ShiftEnter ] as const;
	}

	constructor( editor: Editor ) {
		super( editor );

		editor.config.define( 'lineLimit', {
			maxLines: 0,
			charsPerLine: 0
		} );

		this.set( {
			wordCount: 0,
			characterCount: 0,
			lineCount: 0,
			currentLineCharacterCount: 0,
			currentLine: 0
		} );
	}

	/**
	 * The maximum number of lines (`0` when the limit is disabled).
	 */
	public get maxLines(): number {
		const value = this.editor.config.get( 'lineLimit.maxLines' )!;

		return isLimitEnabled( value ) ? Math.floor( value ) : 0;
	}

	/**
	 * The maximum number of characters in a line (`0` when wrapping is disabled).
	 */
	public get charsPerLine(): number {
		const value = this.editor.config.get( 'lineLimit.charsPerLine' )!;

		return isLimitEnabled( value ) ? Math.floor( value ) : 0;
	}

	public init(): void {
		const editor = this.editor;
		const model = editor.model;
		const document = model.document;

		model.schema.register( AUTO_WRAP_ELEMENT, {
			allowWhere: '$text',
			allowAttributesOf: '$text',
			isInline: true
		} );

		editor.conversion.for( 'downcast' ).elementToElement( {
			model: AUTO_WRAP_ELEMENT,
			view: ( modelElement, { writer } ) => writer.createEmptyElement( 'br', { [ AUTO_WRAP_VIEW_ATTRIBUTE ]: 'true' } )
		} );

		// Takes precedence over the `softBreak` converter, which handles every other `<br>`.
		editor.conversion.for( 'upcast' ).elementToElement( {
			view: { name: 'br', attributes: { [ AUTO_WRAP_VIEW_ATTRIBUTE ]: true } },
			model: AUTO_WRAP_ELEMENT,
			converterPriority: 'high'
		} );

		document.registerPostFixer( writer => this._fixDocument( writer ) );

		this.listenTo( document, 'change', () => {
			this._postFixerPasses = 0;
		}, { priority: 'highest' } );

		// Fired after every change block, including the ones that only move the selection.
		this.listenTo( document, 'change', () => this._updateCounts() );

		const onUpdate = editor.config.get( 'lineLimit.onUpdate' );

		if ( onUpdate ) {
			this.on<LineLimitUpdateEvent>( 'update', ( evt, data ) => onUpdate( data ) );
		}

		this._updateCounts();

		// Editors without a UI (e.g. a headless editor) have no component factory.
		if ( editor.ui ) {
			editor.ui.componentFactory.add( 'lineLimit', locale => this._createCounterView( locale ) );
		}
	}

	public afterInit(): void {
		// Commands are registered by other plugins, so they are guarded once all plugins are initialized.
		this._guardLineCount( 'insertText', ( before, after, options ) => [ before + ( options.text || '' ) + after ] );
		this._guardLineCount( 'shiftEnter', ( before, after ) => [ before + LINE_SEPARATOR + after ] );
		this._guardLineCount( 'enter', ( before, after ) => [ before, after ] );

		this._skipAutoWrapBreaksOnDelete( 'delete', 'backward' );
		this._skipAutoWrapBreaksOnDelete( 'deleteForward', 'forward' );
	}

	/**
	 * Creates the toolbar view that shows the counts.
	 */
	private _createCounterView( locale: Locale ): LineLimitCounterView {
		const view = new LineLimitCounterView( locale );

		view.maxLines = this.maxLines;
		view.bind( 'lineCount', 'currentLine', 'wordCount', 'currentLineCharacterCount' ).to( this );

		return view;
	}

	/**
	 * The post-fixer: re-wraps all blocks and then trims whatever exceeds the line limit.
	 */
	private _fixDocument( writer: ModelWriter ): boolean {
		if ( this._postFixerPasses >= MAX_POST_FIXER_PASSES ) {
			return false;
		}

		let changed = false;

		for ( const block of this._getTextBlocks() ) {
			changed = this._wrapBlock( writer, block ) || changed;
		}

		changed = this._trimExcessLines( writer ) || changed;

		if ( changed ) {
			this._postFixerPasses++;
		}

		return changed;
	}

	/**
	 * Makes sure the automatic wrap breaks in the block are exactly where they should be. Breaks that are already
	 * in the right place are left untouched, so a block that does not need re-flowing is not modified at all.
	 */
	private _wrapBlock( writer: ModelWriter, block: ModelElement ): boolean {
		const { text, autoWrapBreaks } = getBlockLayout( block );
		const desiredOffsets = getBlockWrapOffsets( text, this.charsPerLine );
		const keptOffsets: Array<number> = [];
		const breaksToRemove: Array<ModelNode> = [];

		for ( const { node, offset } of autoWrapBreaks ) {
			if ( desiredOffsets.includes( offset ) && !keptOffsets.includes( offset ) ) {
				keptOffsets.push( offset );
			} else {
				breaksToRemove.push( node );
			}
		}

		const offsetsToInsert = desiredOffsets.filter( offset => !keptOffsets.includes( offset ) );
		let changed = false;

		for ( const node of breaksToRemove ) {
			writer.remove( node );
			changed = true;
		}

		// Insert in ascending order. The model offset of a logical offset is shifted by the wrap breaks placed before it.
		for ( const offset of offsetsToInsert ) {
			const breaksBefore = keptOffsets.filter( keptOffset => keptOffset < offset ).length;

			writer.insertElement( AUTO_WRAP_ELEMENT, block, offset + breaksBefore );
			keptOffsets.push( offset );
			changed = true;
		}

		return syncAutoWrapBreakAttributes( writer, block ) || changed;
	}

	/**
	 * Removes all content past the last allowed line.
	 */
	private _trimExcessLines( writer: ModelWriter ): boolean {
		const maxLines = this.maxLines;

		if ( !maxLines ) {
			return false;
		}

		const blocks = this._getTextBlocks();
		let remainingLines = maxLines;

		for ( let index = 0; index < blocks.length; index++ ) {
			const block = blocks[ index ];
			const lines = getBlockLineCount( block );

			if ( lines <= remainingLines ) {
				remainingLines -= lines;

				continue;
			}

			// The limit is reached somewhere inside this block: cut it at the break that starts the first excess line.
			if ( remainingLines > 0 ) {
				const firstExcessBreak = getLineBreaks( block )[ remainingLines - 1 ];

				writer.remove( writer.createRange(
					writer.createPositionBefore( firstExcessBreak ),
					writer.createPositionAt( block, 'end' )
				) );
				removeFollowingContent( writer, block );
			}
			// The limit is reached exactly at the end of the previous block.
			else {
				removeFollowingContent( writer, blocks[ index - 1 ] );
			}

			// Blocks that could not be removed together with their ancestors (e.g. in other table cells).
			for ( const leftover of blocks.slice( index + 1 ) ) {
				if ( leftover.root !== this.editor.model.document.graveyard ) {
					writer.remove( leftover );
				}
			}

			return true;
		}

		return false;
	}

	/**
	 * Updates the observable counts and fires the `update` event if any of them changed.
	 */
	private _updateCounts(): void {
		const focusBlock = this._getSelectionFocusBlock();
		let wordCount = 0;
		let characterCount = 0;
		let lineCount = 0;
		let currentLine = 0;
		let currentLineCharacterCount = 0;

		for ( const block of this._getTextBlocks() ) {
			const { text } = getBlockLayout( block );
			const plainText = text.split( OBJECT_REPLACEMENT_CHARACTER ).join( '' );

			if ( block === focusBlock ) {
				const line = getLineAt( this.editor.model.document.selection.focus! );

				currentLine = lineCount + line.index + 1;
				currentLineCharacterCount = countCharacters( line.text );
			}

			wordCount += countWords( plainText.split( LINE_SEPARATOR ).join( ' ' ) );
			characterCount += countCharacters( plainText.split( LINE_SEPARATOR ).join( '' ) );
			lineCount += getBlockLineCount( block );
		}

		if (
			wordCount === this.wordCount &&
			characterCount === this.characterCount &&
			lineCount === this.lineCount &&
			currentLine === this.currentLine &&
			currentLineCharacterCount === this.currentLineCharacterCount
		) {
			return;
		}

		this.set( { wordCount, characterCount, lineCount, currentLine, currentLineCharacterCount } );

		this.fire<LineLimitUpdateEvent>( 'update', {
			wordCount,
			characterCount,
			lineCount,
			currentLine,
			currentLineCharacterCount,
			maxLines: this.maxLines,
			charsPerLine: this.charsPerLine
		} );
	}

	/**
	 * Returns the text block the selection focus is in, or `null` when it is not in a text block.
	 */
	private _getSelectionFocusBlock(): ModelElement | null {
		const position = this.editor.model.document.selection.focus;
		const block = position && position.parent;

		if ( !block || !block.is( 'element' ) || !this._isTextBlock( block ) ) {
			return null;
		}

		return block;
	}

	/**
	 * Stops a command when executing it would add lines above the limit. `getResultingTexts()` returns the logical texts
	 * of the block(s) the edited block turns into, given the logical text before and after the command's selection.
	 */
	private _guardLineCount(
		commandName: string,
		getResultingTexts: ( before: string, after: string, options: { text?: string } ) => Array<string>
	): void {
		const command = this.editor.commands.get( commandName );

		if ( !command ) {
			return;
		}

		this.listenTo<LineLimitCommandExecuteEvent>( command, 'execute', ( evt, args ) => {
			const maxLines = this.maxLines;

			if ( !maxLines ) {
				return;
			}

			const options = args[ 0 ] || {};
			const range = this._getCommandRange( options );
			const block = range.start.parent as ModelElement;

			// Changes spanning multiple blocks are left to the post-fixer.
			if ( block !== range.end.parent || !this._isTextBlock( block ) ) {
				return;
			}

			const { text } = getBlockLayout( block );
			const before = text.slice( 0, getLogicalOffset( range.start ) );
			const after = text.slice( getLogicalOffset( range.end ) );
			const currentLines = countLines( text, this.charsPerLine );
			const resultingLines = getResultingTexts( before, after, options )
				.reduce( ( total, blockText ) => total + countLines( blockText, this.charsPerLine ), 0 );

			if ( resultingLines > currentLines && this._countDocumentLines() - currentLines + resultingLines > maxLines ) {
				evt.stop();
				this.fire<LineLimitReachedEvent>( 'limitReached', { commandName } );
			}
		}, { priority: 'high' } );
	}

	/**
	 * Automatic wrap breaks are not real content, so deleting one would immediately bring it back.
	 * Instead, <kbd>Backspace</kbd> / <kbd>Delete</kbd> next to such a break deletes the character on its other side.
	 */
	private _skipAutoWrapBreaksOnDelete( commandName: string, direction: 'backward' | 'forward' ): void {
		const command = this.editor.commands.get( commandName );

		if ( !command ) {
			return;
		}

		const model = this.editor.model;

		this.listenTo<LineLimitCommandExecuteEvent>( command, 'execute', ( evt, args ) => {
			const options = args[ 0 ] || {};
			const selection = options.selection || model.document.selection;
			let position: ModelPosition;

			if ( selection.isCollapsed ) {
				position = selection.getFirstPosition()!;

				const node = direction == 'backward' ? position.nodeBefore : position.nodeAfter;

				if ( !isAutoWrapBreak( node ) ) {
					return;
				}

				position = direction == 'backward' ? model.createPositionBefore( node! ) : model.createPositionAfter( node! );
			} else {
				const range = selection.getFirstRange()!;

				// E.g. the browser asked to delete exactly the `<br>` (`beforeinput` target ranges).
				if ( selection.rangeCount > 1 || !Array.from( range.getItems() ).every( isAutoWrapBreak ) ) {
					return;
				}

				position = direction == 'backward' ? range.start : range.end;
			}

			args[ 0 ] = { ...options, selection: model.createSelection( position ) };
		}, { priority: 'high' } );
	}

	/**
	 * Returns the range a typing/enter command is going to operate on.
	 */
	private _getCommandRange( options: LineLimitCommandOptions ): ModelRange {
		const model = this.editor.model;

		if ( options.selection ) {
			return options.selection.getFirstRange()!;
		}

		if ( options.range ) {
			return options.range;
		}

		return model.document.selection.getFirstRange()!;
	}

	/**
	 * Returns the actual number of lines in the document.
	 */
	private _countDocumentLines(): number {
		return this._getTextBlocks().reduce( ( total, block ) => total + getBlockLineCount( block ), 0 );
	}

	/**
	 * Returns all blocks that can contain text (paragraphs, headings, list items, ...) in document order.
	 */
	private _getTextBlocks(): Array<ModelElement> {
		const model = this.editor.model;
		const blocks: Array<ModelElement> = [];

		for ( const root of model.document.getRoots() ) {
			for ( const item of model.createRangeIn( root ).getItems() ) {
				if ( item.is( 'element' ) && this._isTextBlock( item ) ) {
					blocks.push( item );
				}
			}
		}

		return blocks;
	}

	private _isTextBlock( element: ModelElement ): boolean {
		const schema = this.editor.model.schema;

		return schema.isBlock( element ) && schema.checkChild( element, '$text' );
	}
}

/**
 * Fired whenever the word, character or line count changes.
 *
 * @eventName ~LineLimit#update
 */
export type LineLimitUpdateEvent = {
	name: 'update';
	args: [ LineLimitUpdateData ];
};

/**
 * Fired when typing, <kbd>Enter</kbd> or <kbd>Shift</kbd>+<kbd>Enter</kbd> was blocked because of the line limit.
 *
 * @eventName ~LineLimit#limitReached
 */
export type LineLimitReachedEvent = {
	name: 'limitReached';
	args: [ { commandName: string } ];
};

type LineLimitCommandOptions = {
	text?: string;
	selection?: ModelSelection | ModelDocumentSelection;
	range?: ModelRange;
};

type LineLimitCommandExecuteEvent = {
	name: 'execute';
	args: [ Array<LineLimitCommandOptions | undefined> ];
};

/**
 * The logical text of a block (see {@link module:line-limit/utils}) and its automatic wrap breaks
 * with their offsets in that text.
 */
function getBlockLayout( block: ModelElement ): { text: string; autoWrapBreaks: Array<{ node: ModelNode; offset: number }> } {
	const autoWrapBreaks: Array<{ node: ModelNode; offset: number }> = [];
	let text = '';

	for ( const child of block.getChildren() ) {
		if ( child.is( '$text' ) ) {
			text += child.data;
		} else if ( isAutoWrapBreak( child ) ) {
			autoWrapBreaks.push( { node: child, offset: text.length } );
		} else if ( child.is( 'element', 'softBreak' ) ) {
			text += LINE_SEPARATOR;
		} else {
			text += OBJECT_REPLACEMENT_CHARACTER;
		}
	}

	return { text, autoWrapBreaks };
}

/**
 * Converts a model position inside a block into an offset in the block's logical text.
 */
function getLogicalOffset( position: ModelPosition ): number {
	let autoWrapBreaksBefore = 0;

	for ( const child of ( position.parent as ModelElement ).getChildren() ) {
		if ( child.startOffset! >= position.offset ) {
			break;
		}

		if ( isAutoWrapBreak( child ) ) {
			autoWrapBreaksBefore++;
		}
	}

	return position.offset - autoWrapBreaksBefore;
}

/**
 * Returns all line breaks (manual and automatic) in a block.
 */
function getLineBreaks( block: ModelElement ): Array<ModelElement> {
	return Array.from( block.getChildren() ).filter(
		( child ): child is ModelElement => child.is( 'element', 'softBreak' ) || isAutoWrapBreak( child )
	);
}

/**
 * Returns the line of a block a position is in: its index in the block and its text.
 * A position right before a break belongs to the line that the break ends.
 */
function getLineAt( position: ModelPosition ): { index: number; text: string } {
	let index = 0;
	let text = '';

	for ( const child of ( position.parent as ModelElement ).getChildren() ) {
		if ( child.is( '$text' ) ) {
			text += child.data;
		} else if ( child.is( 'element', 'softBreak' ) || isAutoWrapBreak( child ) ) {
			if ( child.startOffset! >= position.offset ) {
				break;
			}

			index++;
			text = '';
		}
	}

	return { index, text };
}

function getBlockLineCount( block: ModelElement ): number {
	return 1 + getLineBreaks( block ).length;
}

function isAutoWrapBreak( node: ModelItem | null ): boolean {
	return !!node && node.is( 'element', AUTO_WRAP_ELEMENT );
}

/**
 * Gives every automatic wrap break the attributes of the text that follows it (e.g. `bold`), so the selection
 * at the start of a wrapped line keeps the formatting of that line. This mirrors what `ShiftEnter` does for soft breaks.
 */
function syncAutoWrapBreakAttributes( writer: ModelWriter, block: ModelElement ): boolean {
	let changed = false;

	for ( const child of block.getChildren() ) {
		if ( !isAutoWrapBreak( child ) ) {
			continue;
		}

		const nextSibling = child.nextSibling;
		const expected = new Map( nextSibling && nextSibling.is( '$text' ) ? nextSibling.getAttributes() : [] );
		const current = new Map( child.getAttributes() );

		for ( const key of current.keys() ) {
			if ( !expected.has( key ) ) {
				writer.removeAttribute( key, child );
				changed = true;
			}
		}

		for ( const [ key, value ] of expected ) {
			if ( current.get( key ) !== value ) {
				writer.setAttribute( key, value, child );
				changed = true;
			}
		}
	}

	return changed;
}

/**
 * Removes everything that follows the given element, at every level up to the root. The siblings of structural
 * limit elements (e.g. the following cells of a table row or rows of a table) are kept, as removing them would
 * break the structure.
 */
function removeFollowingContent( writer: ModelWriter, element: ModelElement ): void {
	const schema = writer.model.schema;
	let node: ModelElement = element;

	while ( node.parent ) {
		if ( !schema.isLimit( node ) || schema.isObject( node ) ) {
			writer.remove( writer.createRange( writer.createPositionAfter( node ), writer.createPositionAt( node.parent, 'end' ) ) );
		}

		node = node.parent as ModelElement;
	}
}

