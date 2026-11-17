// Stat tile: a label, a value with an optional unit, and an optional note. Used on home and records.
import styles from './Stat.module.css'

export function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {note && <div className={styles.note}>{note}</div>}
    </div>
  )
}
