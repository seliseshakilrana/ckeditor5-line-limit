declare global {
	interface Window {
		editor: ClassicEditor;
	}
}

import {
	ClassicEditor,
	Autoformat,
	Bold,
	Essentials,
	Heading,
	Italic,
	List,
	Paragraph
} from 'ckeditor5';

import CKEditorInspector from '@ckeditor/ckeditor5-inspector';

import LineLimit from '../src/linelimit.js';

import 'ckeditor5/ckeditor5.css';

const status = document.getElementById( 'status' )!;

ClassicEditor
	.create( document.getElementById( 'editor' )!, {
		licenseKey: 'GPL',
		plugins: [
			LineLimit,
			Essentials,
			Autoformat,
			Bold,
			Heading,
			Italic,
			List,
			Paragraph
		],
		toolbar: [
			'undo',
			'redo',
			'|',
			'heading',
			'|',
			'bold',
			'italic',
			'bulletedList',
			'numberedList',
			'|',
			'lineLimit'
		],
		lineLimit: {
			maxLines: 16,
			charsPerLine: 40
		}
	} )
	.then( editor => {
		window.editor = editor;

		const lineLimit = editor.plugins.get( LineLimit );

		lineLimit.on( 'limitReached', () => {
			status.textContent = 'Line limit reached.';
			window.setTimeout( () => {
				status.textContent = '';
			}, 1500 );
		} );

		CKEditorInspector.attach( editor );
		window.console.log( 'CKEditor 5 is ready.', editor );
	} )
	.catch( err => {
		window.console.error( err.stack );
	} );
