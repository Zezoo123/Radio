import { ReactNode } from 'react'

/** A small "?" icon next to a page title that reveals the page description on hover/focus. */
export default function PageHelp({ children }: { children: ReactNode }) {
  return (
    <span className="page-help">
      <button type="button" className="page-help-btn" aria-label="About this page">
        ?
      </button>
      <span role="tooltip" className="page-help-tip">
        {children}
      </span>
    </span>
  )
}
