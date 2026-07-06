import { debugLog } from './debug';
import type { Term } from '../../term';

/**
 Copy text selection to clipboard on double click or select
 @param text - the selected text to copy
 */
// TS types claim navigator.clipboard always exists, but on insecure
// origins (plain-HTTP LAN access) it is undefined at runtime.
export function hasClipboardApi(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return navigator.clipboard !== undefined;
}

export function copySelected(text: string): void {
  debugLog(`copy len=${String(text.length)} api=${String(hasClipboardApi())}`);
  if (!hasClipboardApi()) {
    // Clipboard API requires a secure context (https or localhost);
    // fall back to execCommand so copy works over plain-HTTP LAN access.
    fallbackCopy(text);
    return;
  }
  navigator.clipboard.writeText(text).catch(() => {
    fallbackCopy(text);
  });
}

// execCommand('copy') is refused outside a user gesture in some browsers —
// macOS Chrome even reports success without writing. Writes that arrive
// asynchronously (OSC 52 round-trips) get parked here and are re-copied on
// the very next trusted interaction, inside a real gesture context.
let pendingCopy: string | undefined;
let flushHooked = false;

function flushPendingCopy(e: Event): void {
  if (!e.isTrusted || pendingCopy === undefined) return;
  const text = pendingCopy;
  pendingCopy = undefined;
  debugLog('parked copy: rewriting in gesture');
  fallbackCopy(text);
}

export function deferCopy(text: string): void {
  pendingCopy = text;
  debugLog('copy parked for next input');
  if (flushHooked) return;
  flushHooked = true;
  for (const type of ['mousedown', 'keydown', 'touchend']) {
    document.addEventListener(type, flushPendingCopy, true);
  }
}

function fallbackCopy(text: string): void {
  const previousFocus = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    // The async Clipboard API does not exist on insecure origins; the
    // deprecated execCommand is the only write path there.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
    // execCommand needs the hidden textarea focused, which steals focus
    // from the terminal; restore it so typing keeps working after copy.
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  }
  debugLog(`execCommand=${String(copied)} copied="${text.slice(0, 24)}"`);
  if (!copied) deferCopy(text);
}

export function copyShortcut(term: Term, e: KeyboardEvent): boolean {
  if (e.type !== 'keydown') return true;
  const ctrlShiftC = e.ctrlKey && e.shiftKey && e.key === 'C';
  const cmdC = e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'c';
  if (!ctrlShiftC && !cmdC) return true;
  const selection = term.hasSelection()
    ? term.getSelection()
    : (document.getSelection()?.toString() ?? '');
  // Plain ⌘C without a terminal selection keeps its browser meaning.
  if (cmdC && selection === '') return true;
  e.preventDefault();
  copySelected(selection);
  return false;
}
