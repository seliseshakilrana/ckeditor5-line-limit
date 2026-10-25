import { describe, expect, it } from 'vitest';
import * as LineLimitPackage from '../src/index.js';
import LineLimitCounterView from '../src/linelimitcounterview.js';
import LineLimit, { AUTO_WRAP_ELEMENT, AUTO_WRAP_VIEW_ATTRIBUTE } from '../src/linelimit.js';
import { countCharacters, countLines, countWords, getBlockWrapOffsets, getWrapOffsets } from '../src/utils.js';

describe( 'CKEditor5 LineLimit package', () => {
	it( 'exports the plugin and the constants', () => {
		expect( LineLimitPackage.LineLimit ).to.equal( LineLimit );
		expect( LineLimitPackage.LineLimitCounterView ).to.equal( LineLimitCounterView );
		expect( LineLimitPackage.AUTO_WRAP_ELEMENT ).to.equal( AUTO_WRAP_ELEMENT );
		expect( LineLimitPackage.AUTO_WRAP_VIEW_ATTRIBUTE ).to.equal( AUTO_WRAP_VIEW_ATTRIBUTE );
	} );

	it( 'exports the text helpers', () => {
		expect( LineLimitPackage.getWrapOffsets ).to.equal( getWrapOffsets );
		expect( LineLimitPackage.getBlockWrapOffsets ).to.equal( getBlockWrapOffsets );
		expect( LineLimitPackage.countLines ).to.equal( countLines );
		expect( LineLimitPackage.countWords ).to.equal( countWords );
		expect( LineLimitPackage.countCharacters ).to.equal( countCharacters );
	} );
} );
