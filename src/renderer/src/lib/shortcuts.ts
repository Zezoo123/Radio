/** Shared guards for the app-wide keyboard shortcuts. */

/** True when the shortcut modifier is held (Ctrl, or ⌘ on macOS). */
export const isMod = (e: KeyboardEvent): boolean => e.ctrlKey || e.metaKey

/** True when the event originates in a place where keys type text. */
export function inEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/** True while any modal dialog or the settings drawer is on top of the view. */
export const overlayOpen = (): boolean =>
  document.querySelector('.modal-overlay, .settings-overlay') != null
