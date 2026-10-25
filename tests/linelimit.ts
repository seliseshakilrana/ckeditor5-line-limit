import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
	ClassicEditor,
	Editor,
	Essentials,
	Paragraph,
	Heading,
	Bold,
	List,
	Table,
	ShiftEnter,
	_getModelData,
	_setModelData,
	type ModelElement,
	type EditorConfig
} from 'ckeditor5';
import LineLimit from '../src/linelimit.js';
import LineLimitCounterView from '../src/linelimitcounterview.js';

describe( 'LineLimit', () => {
	let domElement: HTMLElement, editor: ClassicEditor, lineLimit: LineLimit;

	async function createEditor( config: EditorConfig[ 'lineLimit' ] = {}, extraConfig: EditorConfig = {} ): Promise<void> {
		if ( editor ) {
			await editor.destroy();
		}

		editor = await ClassicEditor.create( domElement, {
			licenseKey: 'GPL',
			plugins: [ Essentials, Paragraph, Heading, Bold, List, Table, LineLimit ],
			lineLimit: config,
			...extraConfig
		} );

		lineLimit = editor.plugins.get( LineLimit );
	}

	/**
	 * Returns the document as an array of rendered lines.
	 */
	function getLines(): Array<string> {
		const lines: Array<string> = [];
		const root = editor.model.document.getRoot()!;

		for ( const item of editor.model.createRangeIn( root ).getItems() ) {
			if ( !item.is( 'element' ) || !editor.model.schema.isBlock( item ) || !editor.model.schema.checkChild( item, '$text' ) ) {
				continue;
			}

			let line = '';

			for ( const child of ( item as ModelElement ).getChildren() ) {
				if ( child.is( 'element', 'softBreak' ) || child.is( 'element', 'autoWrapBreak' ) ) {
					lines.push( line );
					line = '';
				} else if ( child.is( '$text' ) ) {
					line += child.data;
				}
			}

			lines.push( line );
		}

		return lines;
	}

	/**
	 * Builds model data with one paragraph per argument.
	 */
	function paragraphs( ...contents: Array<string> ): string {
		return contents.map( content => `<paragraph>${ content }</paragraph>` ).join( '' );
	}

	function getModel(): string {
		return _getModelData( editor.model );
	}

	function type( text: string ): void {
		for ( const character of text ) {
			editor.execute( 'insertText', { text: character } );
		}
	}

	function paste( html: string ): void {
		const dataTransfer = new DataTransfer();

		dataTransfer.setData( 'text/html', html );
		dataTransfer.setData( 'text/plain', html.replace( /<[^>]+>/g, '' ) );

		editor.editing.view.getDomRoot()!.dispatchEvent( new ClipboardEvent( 'paste', {
			clipboardData: dataTransfer,
			bubbles: true,
			cancelable: true
		} ) );
	}

	beforeEach( async () => {
		domElement = document.createElement( 'div' );
		document.body.appendChild( domElement );

		await createEditor( { maxLines: 4, charsPerLine: 10 } );
	} );

	afterEach( async () => {
		await editor.destroy();
		domElement.remove();
	} );

	it( 'should be named', () => {
		expect( LineLimit.pluginName ).to.equal( 'LineLimit' );
	} );

	it( 'should require ShiftEnter', () => {
		expect( LineLimit.requires ).to.deep.equal( [ ShiftEnter ] );
	} );

	it( 'should be loaded', () => {
		expect( editor.plugins.get( 'LineLimit' ) ).to.be.an.instanceof( LineLimit );
	} );

	describe( 'config', () => {
		it( 'should disable both limits by default', async () => {
			await createEditor( undefined, { lineLimit: undefined } );

			expect( lineLimit.maxLines ).to.equal( 0 );
			expect( lineLimit.charsPerLine ).to.equal( 0 );

			editor.setData( '<p>' + 'word '.repeat( 50 ) + '</p>' + '<p>x</p>'.repeat( 30 ) );

			expect( getLines() ).to.have.length( 31 );
		} );

		it( 'should read the limits', () => {
			expect( lineLimit.maxLines ).to.equal( 4 );
			expect( lineLimit.charsPerLine ).to.equal( 10 );
		} );

		it( 'should treat invalid values as disabled and round fractions down', async () => {
			await createEditor( { maxLines: -1, charsPerLine: Infinity } );

			expect( lineLimit.maxLines ).to.equal( 0 );
			expect( lineLimit.charsPerLine ).to.equal( 0 );

			await createEditor( { maxLines: 3.7, charsPerLine: 5.2 } );

			expect( lineLimit.maxLines ).to.equal( 3 );
			expect( lineLimit.charsPerLine ).to.equal( 5 );
		} );
	} );

	describe( 'conversion', () => {
		it( 'should output wrap breaks with a data attribute', () => {
			editor.setData( '<p>hello world</p>' );

			expect( editor.getData() ).to.equal( '<p>hello&nbsp;<br data-auto-wrap="true">world</p>' );
		} );

		it( 'should keep manual soft breaks as plain <br>', () => {
			editor.setData( '<p>a<br>b</p>' );

			expect( editor.getData() ).to.equal( '<p>a<br>b</p>' );
			expect( getModel() ).to.equal( '<paragraph>[]a<softBreak></softBreak>b</paragraph>' );
		} );

		it( 'should load wrap breaks back as automatic ones', () => {
			editor.setData( '<p>hello <br data-auto-wrap="true">world</p>' );

			expect( getModel() ).to.equal( '<paragraph>[]hello <autoWrapBreak></autoWrapBreak>world</paragraph>' );
		} );

		it( 'should mark wrap breaks in the editing view', () => {
			editor.setData( '<p>hello world</p>' );

			expect( editor.editing.view.getDomRoot()!.querySelector( 'br[data-auto-wrap="true"]' ) ).to.not.equal( null );
		} );
	} );

	describe( 'word wrap', () => {
		it( 'should wrap long text when data is loaded', () => {
			editor.setData( '<p>the quick brown fox</p>' );

			expect( getLines() ).to.deep.equal( [ 'the quick ', 'brown fox' ] );
		} );

		it( 'should move the last word to a new line while typing', () => {
			_setModelData( editor.model, '<paragraph>hello wor[]</paragraph>' );

			type( 'ld' );

			expect( getModel() ).to.equal( '<paragraph>hello <autoWrapBreak></autoWrapBreak>world[]</paragraph>' );
		} );

		it( 'should never split a word that fits in a line', () => {
			_setModelData( editor.model, '<paragraph>[]</paragraph>' );

			type( 'aaaa bbbbbbbbbb cc' );

			expect( getLines() ).to.deep.equal( [ 'aaaa ', 'bbbbbbbbbb ', 'cc' ] );
		} );

		it( 'should cut a word longer than a line at exactly charsPerLine', () => {
			editor.setData( '<p>abcdefghijklmnopqrstuvwxy</p>' );

			expect( getLines() ).to.deep.equal( [ 'abcdefghij', 'klmnopqrst', 'uvwxy' ] );
		} );

		it( 'should re-flow lines when text is deleted in the middle of wrapped text', () => {
			editor.setData( '<p>aaa bbb ccc ddd</p>' );

			expect( getLines() ).to.deep.equal( [ 'aaa bbb ', 'ccc ddd' ] );

			editor.model.change( writer => {
				const paragraph = editor.model.document.getRoot()!.getChild( 0 ) as ModelElement;

				// Remove "bbb ".
				writer.remove( writer.createRange( writer.createPositionAt( paragraph, 4 ), writer.createPositionAt( paragraph, 8 ) ) );
			} );

			expect( getLines() ).to.deep.equal( [ 'aaa ccc ', 'ddd' ] );

			editor.model.change( writer => {
				const paragraph = editor.model.document.getRoot()!.getChild( 0 ) as ModelElement;

				// Remove "ccc ".
				writer.remove( writer.createRange( writer.createPositionAt( paragraph, 4 ), writer.createPositionAt( paragraph, 8 ) ) );
			} );

			expect( getModel() ).to.equal( '<paragraph>[]aaa ddd</paragraph>' );
		} );

		it( 'should re-flow lines when text is inserted in the middle of wrapped text', () => {
			editor.setData( '<p>aaa bbb ccc ddd</p>' );

			editor.model.change( writer => {
				writer.insertText( 'xxx ', editor.model.document.getRoot()!.getChild( 0 ) as ModelElement, 0 );
			} );

			expect( getLines() ).to.deep.equal( [ 'xxx aaa ', 'bbb ccc ', 'ddd' ] );
		} );

		it( 'should recalculate stale wrap breaks loaded with the data', () => {
			editor.setData( '<p>a <br data-auto-wrap="true">b <br data-auto-wrap="true"><br data-auto-wrap="true">c</p>' );

			expect( getModel() ).to.equal( '<paragraph>[]a b c</paragraph>' );
		} );

		it( 'should wrap the text between manual soft breaks separately', () => {
			editor.setData( '<p>hello world<br>foo bar baz qux</p>' );

			expect( getLines() ).to.deep.equal( [ 'hello ', 'world', 'foo bar ', 'baz qux' ] );
			expect( getModel() ).to.equal(
				'<paragraph>[]hello <autoWrapBreak></autoWrapBreak>world<softBreak></softBreak>' +
				'foo bar <autoWrapBreak></autoWrapBreak>baz qux</paragraph>'
			);
		} );

		it( 'should not touch empty paragraphs', () => {
			editor.setData( '<p></p><p>hello</p><p></p>' );

			expect( getModel() ).to.equal( '<paragraph>[]</paragraph><paragraph>hello</paragraph><paragraph></paragraph>' );
			expect( lineLimit.lineCount ).to.equal( 3 );
		} );

		it( 'should wrap headings and list items too', () => {
			editor.setData( '<h2>hello world</h2><ul><li>hello world</li></ul>' );

			expect( getLines() ).to.deep.equal( [ 'hello ', 'world', 'hello ', 'world' ] );
		} );

		it( 'should keep text attributes', () => {
			editor.setData( '<p>hello <strong>world</strong></p>' );

			expect( getModel() ).to.equal(
				'<paragraph>[]hello <autoWrapBreak bold="true"></autoWrapBreak><$text bold="true">world</$text></paragraph>'
			);
		} );

		it( 'should not modify the document when the wrap breaks are already correct', () => {
			editor.setData( '<p>hello world</p>' );

			const spy = vi.fn();

			editor.model.on( 'applyOperation', spy );

			editor.model.change( writer => {
				writer.setAttribute( 'bold', true, writer.createRangeIn( editor.model.document.getRoot()!.getChild( 0 ) as ModelElement ) );
			} );

			// Only the user's attribute operations, no softBreak removals or insertions.
			const operationTypes = spy.mock.calls.map( ( [ , [ operation ] ] ) => operation.type );

			expect( operationTypes ).to.not.include( 'insert' );
			expect( operationTypes ).to.not.include( 'remove' );
			expect( operationTypes ).to.not.include( 'move' );
			expect( operationTypes ).to.include( 'addAttribute' );
		} );

		it( 'should remove wrap breaks when wrapping is disabled', async () => {
			await createEditor( { maxLines: 4 } );

			editor.setData( '<p>hello <br data-auto-wrap="true">world</p>' );

			expect( getModel() ).to.equal( '<paragraph>[]hello world</paragraph>' );
		} );

		it( 'should treat an inline object as a non-breaking character', async () => {
			await createEditor( { charsPerLine: 3 } );

			editor.model.schema.register( 'inlineWidget', { inheritAllFrom: '$inlineObject' } );
			editor.conversion.elementToElement( { model: 'inlineWidget', view: 'span' } );

			_setModelData( editor.model, '<paragraph>ab<inlineWidget></inlineWidget> c[]</paragraph>' );

			expect( getModel() ).to.equal(
				'<paragraph>ab<inlineWidget></inlineWidget> <autoWrapBreak></autoWrapBreak>c[]</paragraph>'
			);

			_setModelData( editor.model, '<paragraph>abc <inlineWidget></inlineWidget>d[]</paragraph>' );

			expect( getModel() ).to.equal(
				'<paragraph>abc <autoWrapBreak></autoWrapBreak><inlineWidget></inlineWidget>d[]</paragraph>'
			);
		} );

		it( 'should keep the attributes of a wrap break in sync with the text that follows it', () => {
			editor.setData( '<p>hello <strong>world</strong></p>' );

			editor.model.change( writer => {
				const paragraph = editor.model.document.getRoot()!.getChild( 0 ) as ModelElement;

				// Only "world", not the break before it.
				const world = writer.createRange( writer.createPositionAt( paragraph, 7 ), writer.createPositionAt( paragraph, 'end' ) );

				writer.removeAttribute( 'bold', world );
			} );

			expect( getModel() ).to.equal( '<paragraph>[]hello <autoWrapBreak></autoWrapBreak>world</paragraph>' );
		} );
	} );

	describe( 'cursor position', () => {
		it( 'should keep the cursor after the typed character when the word wraps', () => {
			_setModelData( editor.model, '<paragraph>aaa bbbbbb[]</paragraph>' );

			type( 'c' );

			expect( getModel() ).to.equal( '<paragraph>aaa <autoWrapBreak></autoWrapBreak>bbbbbbc[]</paragraph>' );
		} );

		it( 'should keep the cursor in the middle of a word that moves to a new line', () => {
			_setModelData( editor.model, '<paragraph>aaa bb[]bbbb</paragraph>' );

			type( 'c' );

			expect( getModel() ).to.equal( '<paragraph>aaa <autoWrapBreak></autoWrapBreak>bbc[]bbbb</paragraph>' );
		} );

		it( 'should keep the cursor when lines re-flow after deleting', () => {
			_setModelData( editor.model, '<paragraph>aaa bbb <autoWrapBreak></autoWrapBreak>cc[]c ddd</paragraph>' );

			editor.execute( 'delete' );

			// "aaa bbb cc" fits now, so "ddd" is the word that wraps.
			expect( getModel() ).to.equal( '<paragraph>aaa bbb c[]c <autoWrapBreak></autoWrapBreak>ddd</paragraph>' );

			_setModelData( editor.model, '<paragraph>aaa b[]bb <autoWrapBreak></autoWrapBreak>ccc ddd</paragraph>' );

			editor.execute( 'delete' );

			expect( getModel() ).to.equal( '<paragraph>aaa []bb ccc <autoWrapBreak></autoWrapBreak>ddd</paragraph>' );
		} );

		it( 'should keep the cursor in a following paragraph', () => {
			_setModelData( editor.model, '<paragraph>aaa bbb</paragraph><paragraph>x[]y</paragraph>' );

			editor.model.change( writer => {
				writer.insertText( 'cccc', editor.model.document.getRoot()!.getChild( 0 ) as ModelElement, 'end' );
			} );

			expect( getModel() ).to.equal(
				'<paragraph>aaa <autoWrapBreak></autoWrapBreak>bbbcccc</paragraph><paragraph>x[]y</paragraph>'
			);
		} );
	} );

	describe( 'deleting next to a wrap break', () => {
		beforeEach( () => {
			_setModelData( editor.model, '<paragraph>hello <autoWrapBreak></autoWrapBreak>[]world</paragraph>' );
		} );

		it( 'Backspace at the start of a wrapped line should delete the character before the break', () => {
			editor.execute( 'delete' );

			expect( getModel() ).to.equal( '<paragraph>hello[]world</paragraph>' );
		} );

		it( 'Delete at the end of a wrapped line should delete the character after the break', () => {
			_setModelData( editor.model, '<paragraph>hello []<autoWrapBreak></autoWrapBreak>world</paragraph>' );

			editor.execute( 'deleteForward' );

			expect( getModel() ).to.equal( '<paragraph>hello []orld</paragraph>' );
		} );

		it( 'should handle a selection that contains only the break (browser target ranges)', () => {
			const paragraph = editor.model.document.getRoot()!.getChild( 0 ) as ModelElement;
			const selection = editor.model.createSelection( editor.model.createRange(
				editor.model.createPositionAt( paragraph, 6 ),
				editor.model.createPositionAt( paragraph, 7 )
			) );

			editor.execute( 'delete', { selection } );

			expect( getModel() ).to.equal( '<paragraph>hello[]world</paragraph>' );

			_setModelData( editor.model, '<paragraph>hello <autoWrapBreak></autoWrapBreak>world[]</paragraph>' );

			const newParagraph = editor.model.document.getRoot()!.getChild( 0 ) as ModelElement;
			const forwardSelection = editor.model.createSelection( editor.model.createRange(
				editor.model.createPositionAt( newParagraph, 6 ),
				editor.model.createPositionAt( newParagraph, 7 )
			) );

			editor.execute( 'deleteForward', { selection: forwardSelection } );

			expect( getModel() ).to.equal( '<paragraph>hello []orld</paragraph>' );
		} );

		it( 'should not interfere with deleting other content', () => {
			_setModelData( editor.model, '<paragraph>a<softBreak></softBreak>[]b</paragraph>' );

			editor.execute( 'delete' );

			expect( getModel() ).to.equal( '<paragraph>a[]b</paragraph>' );

			_setModelData( editor.model, '<paragraph>[ab]c</paragraph>' );

			editor.execute( 'delete' );

			expect( getModel() ).to.equal( '<paragraph>[]c</paragraph>' );
		} );

		it( 'should delete a range containing a break together with text', () => {
			_setModelData( editor.model, '<paragraph>hel[lo <autoWrapBreak></autoWrapBreak>wo]rld</paragraph>' );

			editor.execute( 'delete' );

			expect( getModel() ).to.equal( '<paragraph>hel[]rld</paragraph>' );
		} );
	} );

	describe( 'line limit', () => {
		it( 'should block Enter at the limit', () => {
			_setModelData( editor.model, paragraphs( 'a', 'b', 'c', 'd[]' ) );

			const spy = vi.fn();

			lineLimit.on( 'limitReached', spy );
			editor.execute( 'enter' );

			expect( getLines() ).to.deep.equal( [ 'a', 'b', 'c', 'd' ] );
			expect( spy ).toHaveBeenCalledTimes( 1 );
			expect( spy.mock.calls[ 0 ][ 1 ] ).to.deep.equal( { commandName: 'enter' } );
		} );

		it( 'should allow Enter below the limit', () => {
			_setModelData( editor.model, '<paragraph>a</paragraph><paragraph>b[]</paragraph>' );

			editor.execute( 'enter' );

			expect( getLines() ).to.deep.equal( [ 'a', 'b', '' ] );
		} );

		it( 'should allow Enter at the limit when it does not add a line', () => {
			_setModelData( editor.model, paragraphs( 'a', 'b', 'hello <autoWrapBreak></autoWrapBreak>[]world' ) );

			editor.execute( 'enter' );

			expect( getModel() ).to.equal( paragraphs( 'a', 'b', 'hello ', '[]world' ) );
		} );

		it( 'should allow Enter replacing a selection that spans blocks', () => {
			_setModelData( editor.model, paragraphs( 'a', 'b', 'c[', 'd]' ) );

			editor.execute( 'enter' );

			expect( getLines() ).to.deep.equal( [ 'a', 'b', 'c', '' ] );
		} );

		it( 'should block Shift+Enter at the limit', () => {
			_setModelData( editor.model, paragraphs( 'a', 'b', 'c', 'd[]' ) );

			editor.execute( 'shiftEnter' );

			expect( getLines() ).to.deep.equal( [ 'a', 'b', 'c', 'd' ] );
		} );

		it( 'should block typing that would wrap to a line above the limit', () => {
			_setModelData( editor.model, paragraphs( 'a', 'b', 'c', 'aaaa bbbb[]' ) );

			const spy = vi.fn();

			lineLimit.on( 'limitReached', spy );
			type( 'b' );
			type( 'b' );

			expect( getLines() ).to.deep.equal( [ 'a', 'b', 'c', 'aaaa bbbbb' ] );
			expect( spy ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'should allow typing in the last line that still fits', () => {
			_setModelData( editor.model, paragraphs( 'a', 'b', 'c', 'aaaa []' ) );

			type( 'bbbbb' );

			expect( getLines() ).to.deep.equal( [ 'a', 'b', 'c', 'aaaa bbbbb' ] );
		} );

		it( 'should allow typing over a selection that frees lines', () => {
			_setModelData( editor.model, paragraphs( 'a', 'b', '[aaa <autoWrapBreak></autoWrapBreak>bbb]', 'c' ) );

			type( 'x' );

			expect( getLines() ).to.deep.equal( [ 'a', 'b', 'x', 'c' ] );
		} );

		it( 'should respect the selection and range passed to insertText', () => {
			_setModelData( editor.model, paragraphs( 'a', 'b', 'c', 'aaaa bbbb[]' ) );

			const lastParagraph = editor.model.document.getRoot()!.getChild( 3 ) as ModelElement;
			const range = editor.model.createRange( editor.model.createPositionAt( lastParagraph, 9 ) );

			editor.execute( 'insertText', { text: 'xx', range } );
			editor.execute( 'insertText', { text: 'xx', selection: editor.model.createSelection( range ) } );

			expect( getLines() ).to.deep.equal( [ 'a', 'b', 'c', 'aaaa bbbb' ] );

			// Replacing a selection with nothing never adds lines.
			editor.execute( 'insertText', { selection: editor.model.createSelection( lastParagraph, 'in' ) } );

			expect( getLines() ).to.deep.equal( [ 'a', 'b', 'c', '' ] );
		} );

		it( 'should not fail when the typing and enter commands are not available', async () => {
			await editor.destroy();

			editor = await ClassicEditor.create( domElement, {
				licenseKey: 'GPL',
				plugins: [ Paragraph, LineLimit ],
				lineLimit: { maxLines: 2, charsPerLine: 5 }
			} );

			editor.setData( '<p>hello world foo</p>' );

			expect( getLines() ).to.deep.equal( [ 'hello ', 'world ' ] );
		} );

		it( 'should not block anything when the limit is disabled', async () => {
			await createEditor( { charsPerLine: 10 } );

			_setModelData( editor.model, '<paragraph>a[]</paragraph>' );

			for ( let i = 0; i < 20; i++ ) {
				editor.execute( 'enter' );
			}

			expect( getLines() ).to.have.length( 21 );
		} );

		it( 'should trim excess blocks loaded with the data', () => {
			editor.setData( '<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p><p>6</p>' );

			expect( editor.getData() ).to.equal( '<p>1</p><p>2</p><p>3</p><p>4</p>' );
		} );

		it( 'should trim the lines of a block that exceeds the limit', () => {
			editor.setData( '<p>one</p><p>aaa bbb ccc ddd eee fff</p><p>after</p>' );

			expect( getLines() ).to.deep.equal( [ 'one', 'aaa bbb ', 'ccc ddd ', 'eee fff' ] );

			editor.setData( '<p>one</p><p>two</p><p>a<br>b<br>c</p>' );

			expect( getLines() ).to.deep.equal( [ 'one', 'two', 'a', 'b' ] );
		} );

		it( 'should trim excess content from pasted text', () => {
			_setModelData( editor.model, '<paragraph>abc[]</paragraph>' );

			paste( '<p>one two three four five six seven eight nine ten</p>' );

			expect( getLines() ).to.have.length( 4 );
			expect( getLines()[ 0 ] ).to.equal( 'abcone two ' );
		} );

		it( 'should trim excess paragraphs from pasted content', () => {
			_setModelData( editor.model, '<paragraph>[]</paragraph>' );

			paste( '<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p><p>6</p>' );

			expect( getLines() ).to.deep.equal( [ '1', '2', '3', '4' ] );
		} );

		it( 'should remove non-text content after the last line', () => {
			editor.setData(
				'<p>1</p><p>2</p><p>3</p><p>4</p>' +
				'<figure class="table"><table><tbody><tr><td>x</td></tr></tbody></table></figure>'
			);

			expect( editor.getData() ).to.equal( '<p>1</p><p>2</p><p>3</p><p>4</p>' );
		} );

		it( 'should trim content inside a table', () => {
			editor.setData(
				'<figure class="table"><table><tbody><tr><td><p>1</p><p>2</p><p>3</p><p>4</p><p>5</p></td></tr></tbody></table></figure>'
			);

			expect( getLines() ).to.deep.equal( [ '1', '2', '3', '4' ] );
		} );

		it( 'should not loop forever when another post-fixer re-adds removed content', () => {
			// Every table cell must contain a paragraph, so the table post-fixer re-adds what the line limit removes.
			expect( () => {
				editor.setData(
					'<p>1</p><p>2</p><p>3</p>' +
					'<figure class="table"><table><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table></figure>'
				);
			} ).to.not.throw();
		} );
	} );

	describe( 'undo', () => {
		it( 'should undo typing and the wrap in a single step', () => {
			_setModelData( editor.model, '<paragraph>hello wor[]</paragraph>' );

			editor.model.change( writer => {
				writer.insertText( 'ld', editor.model.document.selection.getFirstPosition()! );
			} );

			expect( getLines() ).to.deep.equal( [ 'hello ', 'world' ] );

			editor.execute( 'undo' );

			expect( getModel() ).to.equal( '<paragraph>hello wor[]</paragraph>' );
		} );

		it( 'should undo a trimmed paste in a single step', () => {
			_setModelData( editor.model, '<paragraph>abc[]</paragraph>' );

			paste( '<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p><p>6</p>' );

			expect( getLines() ).to.have.length( 4 );

			editor.execute( 'undo' );

			expect( getModel() ).to.equal( '<paragraph>abc[]</paragraph>' );
		} );

		it( 'should undo a re-flow after deleting in a single step', () => {
			_setModelData( editor.model, '<paragraph>aaa []bbb <autoWrapBreak></autoWrapBreak>ccc</paragraph>' );

			editor.execute( 'deleteForward' );

			expect( getLines() ).to.deep.equal( [ 'aaa bb ccc' ] );

			editor.execute( 'undo' );

			expect( getLines() ).to.deep.equal( [ 'aaa bbb ', 'ccc' ] );
		} );

		it( 'should keep the layout consistent after redo', () => {
			_setModelData( editor.model, '<paragraph>hello wor[]</paragraph>' );

			editor.model.change( writer => {
				writer.insertText( 'ld', editor.model.document.selection.getFirstPosition()! );
			} );

			editor.execute( 'undo' );
			editor.execute( 'redo' );

			expect( getModel() ).to.equal( '<paragraph>hello <autoWrapBreak></autoWrapBreak>world[]</paragraph>' );
		} );
	} );

	describe( 'toolbar counter', () => {
		function getCounterText( view: LineLimitCounterView ): Array<string> {
			return Array.from( view.element!.children ).map( child => child.textContent! );
		}

		it( 'should register the "lineLimit" toolbar component', () => {
			expect( editor.ui.componentFactory.has( 'lineLimit' ) ).to.equal( true );
			expect( editor.ui.componentFactory.create( 'lineLimit' ) ).to.be.an.instanceof( LineLimitCounterView );
		} );

		it( 'should show the counts and update them', () => {
			const view = editor.ui.componentFactory.create( 'lineLimit' ) as LineLimitCounterView;

			view.render();
			editor.setData( '<p>hello world</p>' );

			// The cursor is in the first line ("hello ").
			expect( getCounterText( view ) ).to.deep.equal( [ 'L: 1/4', 'W: 2', 'Char(s): 6' ] );

			editor.model.change( writer => {
				writer.setSelection( editor.model.document.getRoot()!.getChild( 0 )!, 'end' );
			} );

			// The cursor is in the second line ("world").
			expect( getCounterText( view ) ).to.deep.equal( [ 'L: 2/4', 'W: 2', 'Char(s): 5' ] );

			editor.setData( '<p>a</p>' );

			expect( getCounterText( view ) ).to.deep.equal( [ 'L: 1/4', 'W: 1', 'Char(s): 1' ] );

			view.destroy();
		} );

		it( 'should show a dash as the line when the selection is not in a text block', () => {
			const view = editor.ui.componentFactory.create( 'lineLimit' ) as LineLimitCounterView;

			view.render();
			_setModelData( editor.model,
				'<paragraph>abc</paragraph>' +
				'[<table><tableRow><tableCell><paragraph>x</paragraph></tableCell></tableRow></table>]'
			);

			expect( getCounterText( view ) ).to.deep.equal( [ 'L: -/4', 'W: 2', 'Char(s): 0' ] );

			view.destroy();
		} );

		it( 'should be marked as full at the limit', () => {
			const view = editor.ui.componentFactory.create( 'lineLimit' ) as LineLimitCounterView;

			view.render();
			editor.setData( '<p>a</p><p>b</p><p>c</p>' );

			expect( view.element!.classList.contains( 'ck-line-limit-counter_full' ) ).to.equal( false );

			editor.setData( '<p>a</p><p>b</p><p>c</p><p>d</p>' );

			expect( view.element!.classList.contains( 'ck-line-limit-counter_full' ) ).to.equal( true );

			view.destroy();
		} );

		it( 'should show only the line count when there is no limit', async () => {
			await createEditor( { charsPerLine: 10 } );

			const view = editor.ui.componentFactory.create( 'lineLimit' ) as LineLimitCounterView;

			view.render();
			editor.setData( '<p>a</p><p>b</p><p>c</p><p>d</p><p>e</p>' );

			expect( getCounterText( view )[ 0 ] ).to.equal( 'L: 1' );

			editor.model.change( writer => {
				writer.setSelection( editor.model.document.getRoot()!.getChild( 4 )!, 'end' );
			} );

			expect( getCounterText( view )[ 0 ] ).to.equal( 'L: 5' );
			expect( view.element!.classList.contains( 'ck-line-limit-counter_full' ) ).to.equal( false );

			view.destroy();
		} );

		it( 'should be displayed in the toolbar and not be focusable', async () => {
			await createEditor( { maxLines: 4, charsPerLine: 10 }, { toolbar: [ 'undo', 'redo', 'lineLimit' ] } );

			const counter = editor.ui.view.toolbar.items.last as LineLimitCounterView;

			expect( counter ).to.be.an.instanceof( LineLimitCounterView );
			expect( editor.ui.view.toolbar.element!.querySelector( '.ck-line-limit-counter' ) ).to.equal( counter.element );
			expect( ( counter as unknown as { focus?: unknown } ).focus ).to.equal( undefined );
		} );

		it( 'should not be registered in an editor without a UI', async () => {
			class HeadlessEditor extends Editor {}

			const headlessEditor = new HeadlessEditor( {
				licenseKey: 'GPL',
				plugins: [ Paragraph, LineLimit ],
				lineLimit: { maxLines: 2 }
			} );

			await headlessEditor.initPlugins();
			headlessEditor.model.document.createRoot();
			headlessEditor.data.init( '<p>a</p><p>b</p><p>c</p>' );
			// `destroy()` waits for the editor to be ready.
			headlessEditor.fire( 'ready' );

			expect( headlessEditor.ui ).to.equal( undefined );
			expect( headlessEditor.plugins.get( LineLimit ).lineCount ).to.equal( 2 );

			await headlessEditor.destroy();
		} );
	} );

	describe( 'counts', () => {
		it( 'should count words, characters and lines', () => {
			editor.setData( '<p>hello world</p><p>foo</p>' );

			expect( lineLimit.wordCount ).to.equal( 3 );
			expect( lineLimit.characterCount ).to.equal( 14 );
			expect( lineLimit.lineCount ).to.equal( 3 );
		} );

		it( 'should count words separated by soft breaks and not count breaks as characters', () => {
			editor.setData( '<p>a<br>b</p>' );

			expect( lineLimit.wordCount ).to.equal( 2 );
			expect( lineLimit.characterCount ).to.equal( 2 );
			expect( lineLimit.lineCount ).to.equal( 2 );
		} );

		it( 'should count an empty editor as one line', () => {
			editor.setData( '' );

			expect( lineLimit.wordCount ).to.equal( 0 );
			expect( lineLimit.characterCount ).to.equal( 0 );
			expect( lineLimit.lineCount ).to.equal( 1 );
		} );

		describe( 'currentLine', () => {
			it( 'should count lines of previous blocks, manual breaks and wrapped lines', () => {
				_setModelData( editor.model,
					'<paragraph>one</paragraph>' +
					'<paragraph>a<softBreak></softBreak>aaa bbb <autoWrapBreak></autoWrapBreak>cc[]c</paragraph>'
				);

				// "one", "a", "aaa bbb ", "ccc"
				expect( lineLimit.currentLine ).to.equal( 4 );
			} );

			it( 'should belong to the line a break ends when the cursor is right before it', () => {
				_setModelData( editor.model, '<paragraph>aaa bbb []<autoWrapBreak></autoWrapBreak>ccc</paragraph>' );

				expect( lineLimit.currentLine ).to.equal( 1 );

				_setModelData( editor.model, '<paragraph>aaa bbb <autoWrapBreak></autoWrapBreak>[]ccc</paragraph>' );

				expect( lineLimit.currentLine ).to.equal( 2 );
			} );

			it( 'should use the selection focus', () => {
				_setModelData( editor.model, '<paragraph>a[bc</paragraph><paragraph>de]</paragraph>' );

				expect( lineLimit.currentLine ).to.equal( 2 );
			} );

			it( 'should be 0 when the selection is not in a text block', () => {
				_setModelData( editor.model,
					'<paragraph>abc</paragraph>' +
					'[<table><tableRow><tableCell><paragraph>x</paragraph></tableCell></tableRow></table>]'
				);

				expect( lineLimit.currentLine ).to.equal( 0 );
			} );

			it( 'should update when the cursor moves to another line', () => {
				_setModelData( editor.model, '<paragraph>abc[]</paragraph><paragraph>abc</paragraph>' );

				const spy = vi.fn();

				lineLimit.on( 'update', spy );

				editor.model.change( writer => {
					writer.setSelection( editor.model.document.getRoot()!.getChild( 1 )!, 'end' );
				} );

				// Same number of characters, but a different line.
				expect( lineLimit.currentLine ).to.equal( 2 );
				expect( spy ).toHaveBeenCalledTimes( 1 );
			} );

			it( 'should follow the cursor when the word it is in wraps', () => {
				_setModelData( editor.model, '<paragraph>hello wor[]</paragraph>' );

				type( 'ld' );

				expect( lineLimit.currentLine ).to.equal( 2 );
				expect( lineLimit.currentLineCharacterCount ).to.equal( 5 );
			} );
		} );

		describe( 'currentLineCharacterCount', () => {
			it( 'should count the characters of the wrapped line with the cursor', () => {
				_setModelData( editor.model, '<paragraph>aaa bbb <autoWrapBreak></autoWrapBreak>cc[]c ddd</paragraph>' );

				expect( lineLimit.currentLineCharacterCount ).to.equal( 7 );
			} );

			it( 'should count the line before a break when the cursor is at its end', () => {
				_setModelData( editor.model, '<paragraph>aaa bbb []<autoWrapBreak></autoWrapBreak>ccc</paragraph>' );

				expect( lineLimit.currentLineCharacterCount ).to.equal( 8 );

				_setModelData( editor.model, '<paragraph>aaa bbb <autoWrapBreak></autoWrapBreak>[]ccc</paragraph>' );

				expect( lineLimit.currentLineCharacterCount ).to.equal( 3 );
			} );

			it( 'should treat manual soft breaks as line ends', () => {
				_setModelData( editor.model, '<paragraph>aaa<softBreak></softBreak>b[]c<softBreak></softBreak>dddd</paragraph>' );

				expect( lineLimit.currentLineCharacterCount ).to.equal( 2 );
			} );

			it( 'should count an empty line as 0', () => {
				_setModelData( editor.model, '<paragraph>abc</paragraph><paragraph>[]</paragraph>' );

				expect( lineLimit.currentLineCharacterCount ).to.equal( 0 );
			} );

			it( 'should use the selection focus', () => {
				_setModelData( editor.model, '<paragraph>a[bc</paragraph><paragraph>de]</paragraph>' );

				expect( lineLimit.currentLineCharacterCount ).to.equal( 2 );
			} );

			it( 'should be 0 when the selection is not in a text block', () => {
				_setModelData( editor.model,
					'<paragraph>abc</paragraph>' +
					'[<table><tableRow><tableCell><paragraph>x</paragraph></tableCell></tableRow></table>]'
				);

				expect( lineLimit.currentLineCharacterCount ).to.equal( 0 );
			} );

			it( 'should update when the cursor moves and when typing', () => {
				_setModelData( editor.model, '<paragraph>abc[]</paragraph><paragraph>hello</paragraph>' );

				const spy = vi.fn();

				lineLimit.on( 'update', spy );

				type( 'd' );

				expect( lineLimit.currentLineCharacterCount ).to.equal( 4 );

				editor.model.change( writer => {
					writer.setSelection( editor.model.document.getRoot()!.getChild( 1 )!, 'end' );
				} );

				expect( lineLimit.currentLineCharacterCount ).to.equal( 5 );
				expect( spy ).toHaveBeenCalledTimes( 2 );
				expect( spy.mock.calls[ 1 ][ 1 ].currentLineCharacterCount ).to.equal( 5 );
			} );
		} );

		it( 'should be observable', () => {
			const spy = vi.fn();

			lineLimit.on( 'change:lineCount', spy );
			editor.setData( '<p>a</p><p>b</p>' );

			expect( spy ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'should fire the update event with all counts', () => {
			const spy = vi.fn();

			lineLimit.on( 'update', spy );
			editor.setData( '<p>hello world</p>' );

			expect( spy ).toHaveBeenCalledTimes( 1 );
			expect( spy.mock.calls[ 0 ][ 1 ] ).to.deep.equal( {
				wordCount: 2,
				characterCount: 11,
				lineCount: 2,
				currentLine: 1,
				currentLineCharacterCount: 6,
				maxLines: 4,
				charsPerLine: 10
			} );
		} );

		it( 'should not fire the update event when nothing changed', () => {
			editor.setData( '<p>hello world</p>' );

			const spy = vi.fn();

			lineLimit.on( 'update', spy );

			editor.model.change( writer => {
				writer.setAttribute( 'bold', true, writer.createRangeIn( editor.model.document.getRoot()!.getChild( 0 ) as ModelElement ) );
			} );

			expect( spy ).not.toHaveBeenCalled();
		} );

		it( 'should call the onUpdate callback', async () => {
			const onUpdate = vi.fn();

			await createEditor( { maxLines: 16, charsPerLine: 40, onUpdate } );

			onUpdate.mockClear();
			editor.setData( '<p>a</p><p>b</p>' );

			expect( onUpdate ).toHaveBeenCalledWith( {
				wordCount: 2,
				characterCount: 2,
				lineCount: 2,
				currentLine: 1,
				currentLineCharacterCount: 1,
				maxLines: 16,
				charsPerLine: 40
			} );
		} );
	} );
} );
