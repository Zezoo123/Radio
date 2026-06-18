import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const root = createRoot(document.getElementById('root')!)

if (!window.api) {
  root.render(
    <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#e6e9ef' }}>
      <h1>Preload not loaded</h1>
      <p>The bridge (window.api) is unavailable, so the app can’t talk to the main process.</p>
    </div>
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
