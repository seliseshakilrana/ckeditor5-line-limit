import { describe, expect, it } from 'vitest';
import { countCharacters, countLines, countWords, getBlockWrapOffsets, getWrapOffsets, isLimitEnabled } from '../src/utils.js';

/**
 * Applies wrap offsets to a text and returns the resulting lines.
 */
function wrap( text: string, charsPerLine: number ): Array<string> {
	const offsets = [ 0, ...getWrapOffsets( text, charsPerLine ), text.length ];

	return offsets.slice( 1 ).map( ( end, index ) => text.slice( offsets[ index ], end ) );
}

describe( 'utils', () => {
	describe( 'getWrapOffsets()', () => {
		it( 'returns nothing for text that fits', () => {
			expect( getWrapOffsets( '', 10 ) ).to.deep.equal( [] );
			expect( getWrapOffsets( 'hello', 10 ) ).to.deep.equal( [] );
			expect( getWrapOffsets( 'hello worl', 10 ) ).to.deep.equal( [] );
		} );

		it( 'returns nothing when wrapping is disabled', () => {
			expect( getWrapOffsets( 'hello world', 0 ) ).to.deep.equal( [] );
			expect( getWrapOffsets( 'hello world', -1 ) ).to.deep.equal( [] );
			expect( getWrapOffsets( 'hello world', Infinity ) ).to.deep.equal( [] );
			expect( getWrapOffsets( 'hello world', NaN ) ).to.deep.equal( [] );
		} );

		it( 'moves the last word that does not fit to a new line', () => {
			expect( wrap( 'hello world', 10 ) ).to.deep.equal( [ 'hello ', 'world' ] );
			expect( wrap( 'the quick brown fox jumps over the lazy dog', 10 ) )
				.to.deep.equal( [ 'the quick ', 'brown fox ', 'jumps over ', 'the lazy ', 'dog' ] );
		} );

		it( 'lets whitespace before a wrap point hang at the end of the line', () => {
			// "abc" + 3 spaces is 6 characters, but trailing whitespace does not count.
			expect( wrap( 'abc   defgh', 5 ) ).to.deep.equal( [ 'abc   ', 'defgh' ] );
			expect( wrap( 'abcde     ', 5 ) ).to.deep.equal( [ 'abcde     ' ] );
		} );

		it( 'counts whitespace between words', () => {
			expect( wrap( 'ab  cd', 5 ) ).to.deep.equal( [ 'ab  ', 'cd' ] );
			expect( wrap( 'ab  c', 5 ) ).to.deep.equal( [ 'ab  c' ] );
		} );

		it( 'fits a word that ends exactly at the limit', () => {
			expect( wrap( 'abc de fgh', 6 ) ).to.deep.equal( [ 'abc de ', 'fgh' ] );
		} );

		it( 'cuts a word longer than the limit at exactly charsPerLine', () => {
			expect( wrap( 'abcdefghij', 4 ) ).to.deep.equal( [ 'abcd', 'efgh', 'ij' ] );
			expect( wrap( 'abcdefgh', 4 ) ).to.deep.equal( [ 'abcd', 'efgh' ] );
		} );

		it( 'moves a long word to a new line before cutting it', () => {
			expect( wrap( 'ab abcdefghij', 4 ) ).to.deep.equal( [ 'ab ', 'abcd', 'efgh', 'ij' ] );
		} );

		it( 'continues wrapping after the remainder of a cut word', () => {
			expect( wrap( 'abcdef gh ij', 4 ) ).to.deep.equal( [ 'abcd', 'ef ', 'gh ', 'ij' ] );
		} );

		it( 'counts leading whitespace', () => {
			expect( wrap( '  abc', 4 ) ).to.deep.equal( [ '  ab', 'c' ] );
			expect( wrap( '  ab cd', 4 ) ).to.deep.equal( [ '  ab ', 'cd' ] );
		} );

		it( 'treats a non-breaking space as whitespace', () => {
			expect( wrap( 'hello world', 8 ) ).to.deep.equal( [ 'hello ', 'world' ] );
		} );

		it( 'does not split a surrogate pair', () => {
			// Each emoji is 2 UTF-16 code units.
			expect( wrap( 'a😀😀', 2 ) ).to.deep.equal( [ 'a', '😀', '😀' ] );
		} );

		it( 'returns offsets strictly inside the text', () => {
			for ( const text of [ 'a b c d e f', 'abcdefghijklmnop', '   x   y   ', 'xx xx xx xx' ] ) {
				for ( const offset of getWrapOffsets( text, 2 ) ) {
					expect( offset ).to.be.greaterThan( 0 );
					expect( offset ).to.be.lessThan( text.length );
				}
			}
		} );
	} );

	describe( 'getBlockWrapOffsets()', () => {
		it( 'wraps each manual line separately', () => {
			// "hello world" + "\n" + "foo bar baz"
			expect( getBlockWrapOffsets( 'hello world\nfoo bar baz', 8 ) ).to.deep.equal( [ 6, 20 ] );
		} );

		it( 'never puts a wrap offset next to a manual break', () => {
			expect( getBlockWrapOffsets( 'abcd\nabcd', 4 ) ).to.deep.equal( [] );
		} );
	} );

	describe( 'countLines()', () => {
		it( 'counts an empty text as one line', () => {
			expect( countLines( '', 10 ) ).to.equal( 1 );
		} );

		it( 'counts manual and wrapped lines', () => {
			expect( countLines( 'hello world', 10 ) ).to.equal( 2 );
			expect( countLines( 'hello world\n\nfoo', 10 ) ).to.equal( 4 );
			expect( countLines( 'hello world', 0 ) ).to.equal( 1 );
		} );
	} );

	describe( 'countWords()', () => {
		it( 'counts words', () => {
			expect( countWords( '' ) ).to.equal( 0 );
			expect( countWords( '   ' ) ).to.equal( 0 );
			expect( countWords( 'hello' ) ).to.equal( 1 );
			expect( countWords( 'hello,  world!' ) ).to.equal( 2 );
			expect( countWords( 'don\'t stop' ) ).to.equal( 2 );
			expect( countWords( 'zażółć gęślą' ) ).to.equal( 2 );
			expect( countWords( '— - !' ) ).to.equal( 0 );
		} );
	} );

	describe( 'countCharacters()', () => {
		it( 'counts code points', () => {
			expect( countCharacters( '' ) ).to.equal( 0 );
			expect( countCharacters( 'a b' ) ).to.equal( 3 );
			expect( countCharacters( '😀' ) ).to.equal( 1 );
		} );
	} );

	describe( 'isLimitEnabled()', () => {
		it( 'accepts positive finite numbers only', () => {
			expect( isLimitEnabled( 1 ) ).to.equal( true );
			expect( isLimitEnabled( 0 ) ).to.equal( false );
			expect( isLimitEnabled( -5 ) ).to.equal( false );
			expect( isLimitEnabled( Infinity ) ).to.equal( false );
			expect( isLimitEnabled( NaN ) ).to.equal( false );
		} );
	} );
} );
