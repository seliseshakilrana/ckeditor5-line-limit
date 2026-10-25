import './augmentation.js';

export { default as LineLimit, AUTO_WRAP_ELEMENT, AUTO_WRAP_VIEW_ATTRIBUTE } from './linelimit.js';
export { default as LineLimitCounterView } from './linelimitcounterview.js';
export type { LineLimitUpdateEvent, LineLimitReachedEvent } from './linelimit.js';
export type { LineLimitConfig, LineLimitUpdateData } from './linelimitconfig.js';
export { getWrapOffsets, getBlockWrapOffsets, countLines, countWords, countCharacters } from './utils.js';
