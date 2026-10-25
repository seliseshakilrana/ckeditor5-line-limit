@shakil.rana.selisegroup/ckeditor5-line-limit
==================================

A [CKEditor 5](https://ckeditor.com/ckeditor-5/) plugin that turns the editor into a fixed-size text box:

* **Hard word wrap.** Lines longer than `charsPerLine` are wrapped by moving the last word that doesn't fit to a new line. Words are never split, unless a single word is longer than a whole line. Then it's cut at exactly `charsPerLine` characters.
* **Re-flow.** Wrap breaks are automatic soft breaks. They are recalculated after every change, so text re-flows when you type, delete, or paste in the middle of a paragraph.
* **Strict line limit.** The document never has more than `maxLines` lines. <kbd>Enter</kbd>, <kbd>Shift</kbd>+<kbd>Enter</kbd>, and typing are blocked when they would add a line past the limit. Anything else, like pasted content, is trimmed.
* **Counts in the toolbar.** A `lineLimit` toolbar item shows `L: 3/16   W: 19   Char(s): 30` at the right end of the toolbar: the line the cursor is on against the limit, words in the document, and characters in the cursor's line. It turns red when the document is full. The counts are also available as observable properties (`currentLine`, `lineCount`, `wordCount`, `currentLineCharacterCount`, `characterCount`), along with an `update` event.

## Table of contents

* [Installation](#installation)
* [Usage](#usage)
* [Configuration](#configuration)
* [Showing the counts](#showing-the-counts)
* [How it works](#how-it-works)
* [API](#api)
* [Limitations](#limitations)
* [Development](#development)
* [License](#license)

## Installation

```bash
npm install @shakil.rana.selisegroup/ckeditor5-line-limit
```

The package works with CKEditor 5 v46.0.0 or newer (the `ckeditor5` package is a peer dependency).

## Usage

```ts
import { ClassicEditor, Essentials, Paragraph, Bold, Italic } from 'ckeditor5';
import { LineLimit } from '@shakil.rana.selisegroup/ckeditor5-line-limit';

import 'ckeditor5/ckeditor5.css';
import '@shakil.rana.selisegroup/ckeditor5-line-limit/index.css'; // Styles of the toolbar counter.

const editor = await ClassicEditor.create( document.querySelector( '#editor' ), {
	licenseKey: 'GPL', // Or your license key.
	plugins: [ Essentials, Paragraph, Bold, Italic, LineLimit ],
	toolbar: [ 'undo', 'redo', '|', 'bold', 'italic', '|', 'lineLimit' ],
	lineLimit: {
		maxLines: 16,
		charsPerLine: 40
	}
} );
```

`LineLimit` loads `ShiftEnter` itself. Load `Essentials` (or `Typing`, `Enter`, and `Undo`) so that typing, <kbd>Enter</kbd>, and undo are guarded correctly.

To make each wrapped line look like a real line, use a monospace font and size the editable to the line width:

```css
.ck.ck-editor__editable {
	font-family: ui-monospace, Menlo, Consolas, monospace;
}

.ck-content p {
	margin: 0;
}
```

## Configuration

All options go under the `lineLimit` key of the editor configuration.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxLines` | `number` | `0` (no limit) | The maximum number of lines in the document. |
| `charsPerLine` | `number` | `0` (no wrapping) | The maximum number of characters in a line. |
| `onUpdate` | `( data: LineLimitUpdateData ) => void` | – | Called whenever any count changes. Receives the same data as the [`update` event](#events). |

A value of `0`, a negative number, `Infinity`, or `NaN` disables that limit. Fractions are rounded down.

**What counts as a line:**

* Every text block (paragraph, heading, list item, a paragraph inside a table cell, …) starts a new line. An empty paragraph is one line.
* Every soft break starts a new line, whether it was typed (<kbd>Shift</kbd>+<kbd>Enter</kbd>) or inserted by the word wrap.

**What counts as a character in a line:**

* Each character of text, including spaces between words.
* An inline object (e.g. an inline image) counts as one character and is never separated from the word it touches.
* Spaces right before a wrap point don't count. They "hang" at the end of the line, like they do in a browser. So with `charsPerLine: 5`, `"hello world"` wraps into `"hello "` and `"world"`.

## Showing the counts

### In the toolbar

Add `'lineLimit'` to the toolbar items:

```
[ ↶ ↷ | Paragraph ▾ | B I ]                           L: 3/16   W: 19   Char(s): 30
```

| Label | Meaning |
| --- | --- |
| `L: 3/16` | The number of **the line with the cursor** / `maxLines`. Wrapped lines count, so pressing ↓ through a wrapped paragraph goes 1, 2, 3, … Shown as `L: 3` when there is no limit, and as `L: -/16` when the selection isn't in text (e.g. an image is selected). |
| `W: 19` | Words in the whole document. |
| `Char(s): 30` | Characters in **the line with the cursor**, which updates as you type or move the cursor. A wrapped line counts on its own, and spaces count, including the one hanging at the end of a wrapped line. |

Hovering over a value shows a tooltip ("Current line", "Words", "Characters in the current line").

* It is pushed to the right end of the toolbar. Items listed after it are pushed to the right as well.
* When the document is full (`lineCount` reaches `maxLines`), the `L:` value turns red and bold (the `ck-line-limit-counter_full` class), whichever line the cursor is on.
* It isn't focusable, so keyboard navigation in the toolbar skips it.
* Its styles come from `@shakil.rana.selisegroup/ckeditor5-line-limit/index.css`.
* If the toolbar is too narrow, CKEditor moves the last items, including the counter, into the "⋮" overflow menu. To prevent that, set `toolbar: { items: [ ... ], shouldNotGroupWhenFull: true }`.

The labels go through the editor's translation system (`L: %0/%1`, `L: %0`, `W: %0`, `Char(s): %0`).

To restyle it, override these classes:

```css
.ck.ck-toolbar .ck.ck-line-limit-counter { /* the whole counter */ }
.ck-line-limit-counter__lines, .ck-line-limit-counter__words, .ck-line-limit-counter__characters { /* each part */ }
.ck-line-limit-counter_full { /* added at the limit */ }
```

### With the `onUpdate` callback

```ts
const counter = document.querySelector( '#counter' );

ClassicEditor.create( element, {
	plugins: [ /* ... */, LineLimit ],
	lineLimit: {
		maxLines: 16,
		charsPerLine: 40,
		onUpdate: ( { currentLine, maxLines, wordCount, currentLineCharacterCount } ) => {
			counter.textContent = `L: ${ currentLine }/${ maxLines } W: ${ wordCount } Char(s): ${ currentLineCharacterCount }`;
		}
	}
} );
```

### With the plugin's observable properties and events

```ts
const lineLimit = editor.plugins.get( 'LineLimit' );

// Current values.
console.log( lineLimit.currentLine, lineLimit.lineCount, lineLimit.wordCount, lineLimit.currentLineCharacterCount, lineLimit.characterCount );

// Fired whenever any of the counts changes.
lineLimit.on( 'update', ( evt, { lineCount, maxLines } ) => {
	counter.textContent = `${ lineCount } / ${ maxLines } lines`;
} );

// Observable properties, e.g. to bind a UI view.
lineLimit.on( 'change:lineCount', ( evt, name, value ) => { /* ... */ } );

// Fired when typing or Enter was blocked by the limit.
lineLimit.on( 'limitReached', ( evt, { commandName } ) => {
	showToast( 'You have reached the line limit.' );
} );
```

### In React

```tsx
import { useState } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import { ClassicEditor, Essentials, Paragraph } from 'ckeditor5';
import { LineLimit } from '@shakil.rana.selisegroup/ckeditor5-line-limit';

export function CardEditor() {
	const [ lines, setLines ] = useState( 0 );

	return (
		<>
			<CKEditor
				editor={ ClassicEditor }
				config={ {
					licenseKey: 'GPL',
					plugins: [ Essentials, Paragraph, LineLimit ],
					lineLimit: {
						maxLines: 16,
						charsPerLine: 40,
						onUpdate: ( { lineCount } ) => setLines( lineCount )
					}
				} }
			/>
			<p>{ lines } / 16 lines</p>
		</>
	);
}
```

### In Angular

Use the official [`@ckeditor/ckeditor5-angular`](https://www.npmjs.com/package/@ckeditor/ckeditor5-angular) component:

```bash
npm install @ckeditor/ckeditor5-angular ckeditor5 @shakil.rana.selisegroup/ckeditor5-line-limit
```

Angular doesn't support importing CSS from TypeScript files, so add the styles globally instead. Either import them in `src/styles.css`:

```css
@import 'ckeditor5/ckeditor5.css';
@import '@shakil.rana.selisegroup/ckeditor5-line-limit/index.css';
```

Or list them in the `styles` array of `angular.json`:

```json
"styles": [
	"node_modules/ckeditor5/dist/ckeditor5.css",
	"node_modules/@shakil.rana.selisegroup/ckeditor5-line-limit/dist/index.css",
	"src/styles.css"
]
```

Then use the plugin in a component:

```ts
import { Component, NgZone, inject, signal } from '@angular/core';
import { CKEditorModule } from '@ckeditor/ckeditor5-angular';
import { ClassicEditor, Essentials, Paragraph, type EditorConfig } from 'ckeditor5';
import { LineLimit } from '@shakil.rana.selisegroup/ckeditor5-line-limit';

@Component( {
	selector: 'app-card-editor',
	standalone: true,
	imports: [ CKEditorModule ],
	template: `
		<ckeditor [editor]="Editor" [config]="config" />
		<p>{{ lines() }} / 16 lines</p>
	`
} )
export class CardEditorComponent {
	private readonly zone = inject( NgZone );

	readonly Editor = ClassicEditor;
	readonly lines = signal( 0 );

	readonly config: EditorConfig = {
		licenseKey: 'GPL',
		plugins: [ Essentials, Paragraph, LineLimit ],
		toolbar: [ 'undo', 'redo', '|', 'lineLimit' ],
		lineLimit: {
			maxLines: 16,
			charsPerLine: 40,
			// The Angular component runs the editor outside of the Angular zone,
			// so re-enter it to make sure the view is updated.
			onUpdate: ( { lineCount } ) => this.zone.run( () => this.lines.set( lineCount ) )
		}
	};
}
```

To get the plugin instance (for its properties and events), handle the `ready` output:

```ts
// Template: <ckeditor [editor]="Editor" [config]="config" (ready)="onReady( $event )" />
onReady( editor: ClassicEditor ): void {
	const lineLimit = editor.plugins.get( 'LineLimit' );

	lineLimit.on( 'limitReached', () => {
		this.zone.run( () => { /* e.g. show a message */ } );
	} );
}
```

## How it works

### Model and data

Manual soft breaks stay normal `softBreak` elements (`<br>`). Breaks inserted by the word wrap are `autoWrapBreak` inline elements. They are rendered as:

```html
<p>the quick brown&nbsp;<br data-auto-wrap="true">fox jumps</p>
```

So `editor.getData()` shows exactly where the lines break, and `editor.setData()` loads the breaks back as automatic ones. Since breaks are always recalculated, stale or extra `data-auto-wrap` breaks are fixed when the data is loaded, for example after `charsPerLine` changes.

> The wrap breaks are a dedicated element rather than a `softBreak` with an `autoWrap` attribute. In recent CKEditor 5 versions, `ShiftEnter` registers a post-fixer that removes any `softBreak` attribute that doesn't match the text after it, so the attribute would be lost.

### One post-fixer

All wrapping and trimming happens in a single [model post-fixer](https://ckeditor.com/docs/ckeditor5/latest/api/module_engine_model_document-ModelDocument.html#function-registerPostFixer):

1. For every text block, it computes where the wrap breaks belong and compares that with where they are. Only breaks in the wrong place are removed or inserted. A block that is already correct is not touched, so the post-fixer settles after one extra pass and cannot loop.
2. It counts the lines and removes everything after the last allowed line.

Post-fixer changes join the batch of the change that caused them. This means:

* **Undo** reverts a user action and its re-wrapping/trimming as **one step**.
* **The cursor stays in place.** The model keeps the selection anchored to the same characters while breaks are inserted or removed around it.

### Guards before the change

Trimming alone would be unfriendly for typing. If you type at the end of a full last line, the wrapped word would be cut off. So the plugin also checks some commands before they run:

* `insertText` (typing), `enter` and `shiftEnter` are simulated against the current block. If the result would add a line past `maxLines`, the command is cancelled and `limitReached` fires. <kbd>Enter</kbd> at a wrap point doesn't add a line, so it's still allowed at the limit.
* `delete` / `deleteForward` next to an automatic break delete the character on the other side of the break. The break isn't real content, so deleting it would just bring it back. <kbd>Backspace</kbd> at the start of a wrapped line removes the space that ended the previous line, and the words re-flow.

Content that bypasses these commands (paste, drag and drop, `model.insertContent()`, collaboration, …) is trimmed by the post-fixer.

## API

```ts
import {
	LineLimit,                  // The plugin.
	LineLimitCounterView,       // The view behind the 'lineLimit' toolbar item.
	AUTO_WRAP_ELEMENT,          // 'autoWrapBreak' – the model element name.
	AUTO_WRAP_VIEW_ATTRIBUTE,   // 'data-auto-wrap' – the view/data attribute.
	getWrapOffsets,             // ( text, charsPerLine ) => offsets – the wrapping algorithm.
	getBlockWrapOffsets,        // Same, for text containing '\n' (manual soft breaks).
	countLines,                 // ( text, charsPerLine ) => number of lines.
	countWords,
	countCharacters,
	type LineLimitConfig,
	type LineLimitUpdateData,
	type LineLimitUpdateEvent,
	type LineLimitReachedEvent
} from '@shakil.rana.selisegroup/ckeditor5-line-limit';
```

### Plugin properties

| Property | Type | Description |
| --- | --- | --- |
| `wordCount` | `number` (observable, read-only) | Words in the document. |
| `currentLine` | `number` (observable, read-only) | The number (from `1`) of the line with the cursor (the selection focus), counting wrapped lines. `0` when the selection isn't in a text block. |
| `currentLineCharacterCount` | `number` (observable, read-only) | Characters in the line with the cursor (the selection focus), including spaces. `0` when the selection isn't in a text block. |
| `characterCount` | `number` (observable, read-only) | Characters (Unicode code points) in the whole document, including spaces. Line breaks are not counted. |
| `lineCount` | `number` (observable, read-only) | Lines in the document, including wrapped lines. |
| `maxLines` | `number` (read-only) | The effective line limit (`0` when disabled). |
| `charsPerLine` | `number` (read-only) | The effective line width (`0` when disabled). |

### Toolbar component

| Name | Description |
| --- | --- |
| `lineLimit` | The counter. Add it to `toolbar` (or any other toolbar config, e.g. a balloon toolbar). |

### Events

| Event | Data | Fired when |
| --- | --- | --- |
| `update` | `{ wordCount, characterCount, lineCount, currentLine, currentLineCharacterCount, maxLines, charsPerLine }` | Any of the counts changed, including whenever the cursor moves to another line. |
| `limitReached` | `{ commandName }` | Typing, <kbd>Enter</kbd>, or <kbd>Shift</kbd>+<kbd>Enter</kbd> was blocked by the line limit. |

The `update` event fires only when a value actually changes, so making text bold doesn't fire it. Read the properties right after the editor is created to get the initial values.

## Limitations

* **Line width is counted in characters, not pixels.** Wrapped lines only look like the "real" lines with a monospace font and an editable at least `charsPerLine` characters wide. Characters are counted in UTF-16 code units, so an emoji takes two, although a surrogate pair is never split.
* **Tables and other structures.** Lines inside table cells count, and trimming removes paragraphs from cells. A cell must keep at least one paragraph, though, so a table that ends past the limit can't be trimmed completely. The plugin stops after a few passes rather than fighting the table post-fixer, and the document can end up slightly over the limit. Use the plugin with paragraphs, headings, and lists for strict guarantees.
* **Multi-root editors.** Lines are counted across all roots, in root order.

## Development

The package was created with [ckeditor5-package-generator](https://www.npmjs.com/package/ckeditor5-package-generator).

The build tools need **Node.js 24.11+**. An `.nvmrc` is included, so run `nvm use` first.

| Script | Description |
| --- | --- |
| `npm start` | Starts the demo editor (`sample/`) with Vite and opens it in the browser. |
| `npm test` | Runs the unit tests in headless Chrome (Vitest browser mode). Add `-- --coverage` for a coverage report (100% is required). |
| `npm run lint` | Runs ESLint. |
| `npm run build:dist` | Builds `dist/` (the npm build and the browser build). Runs automatically on `npm install` and before publishing. |

Project layout:

```
src/
  linelimit.ts        The plugin: schema, conversion, post-fixer, command guards, counts.
  utils.ts            Pure text layout helpers (wrapping algorithm, counting).
  linelimitcounterview.ts  The toolbar counter view.
  linelimitconfig.ts  Configuration types.
  augmentation.ts     EditorConfig / PluginsMap type augmentation.
  index.ts            Package entry point.
theme/index-editor.css  Styles of the toolbar counter.
tests/                Unit tests (Vitest, real browser).
sample/               The demo editor.
```

## License

Licensed under the terms of the [MIT license](LICENSE.md).
