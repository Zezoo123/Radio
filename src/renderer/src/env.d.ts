/// <reference types="vite/client" />
import type { RadioApi } from '../../preload'

declare global {
  interface Window {
    api: RadioApi
  }
}

export {}
