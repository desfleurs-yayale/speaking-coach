// Shared page chrome for non-camera pages: dream sky backdrop + top navigation.
// Full-screen camera views (a running shadowing session) should NOT use this.
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './AppShell.module.css'

const LINKS = [
  { to: '/', label: '首页', end: true },
  { to: '/shadowing', label: '跟读' },
  { to: '/dialogue', label: '对话' },
  { to: '/records', label: '学习记录' },
  { to: '/vocab', label: '生词本' },
]

export function AppShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      <div className="dream-backdrop" />
      <header className={styles.header}>
        <NavLink to="/" className={styles.brand}>
          <span className={styles.spark}>✦</span>
          <span className="dream-title">Dream Speak</span>
        </NavLink>
        <nav className={styles.nav}>
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="page" style={wide ? { maxWidth: 1400 } : undefined}>
        {children}
      </main>
    </>
  )
}
