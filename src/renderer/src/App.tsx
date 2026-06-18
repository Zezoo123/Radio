export default function App(): JSX.Element {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Radio Scheduler</div>
        <nav>
          <button className="nav-item active">Import</button>
          <button className="nav-item">Day</button>
          <button className="nav-item">Export</button>
          <button className="nav-item">Settings</button>
        </nav>
      </aside>
      <main className="content">
        <h1>Daily playout for BSI Simian</h1>
        <p className="muted">
          Scaffold ready. Import a station grid and element templates, compose a day, and export a
          Simian-importable log. (UI built out in a later milestone.)
        </p>
      </main>
    </div>
  )
}
