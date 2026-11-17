import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import styles from './DialoguePage.module.css'

export default function DialoguePage() {
  return (
    <AppShell>
      <h1 className={styles.heading}>对话</h1>
      <div className={`glass ${styles.card}`}>
        <span className="chip">即将推出</span>
        <p className={styles.text}>
          对话模式像打视频电话一样，屏幕另一边是一位 AI 老师，你们用英语聊一个情景。这个模式还在准备中，现在可以先用跟读练发音和语感。
        </p>
        <Link className="btn btn-primary" to="/shadowing">
          去跟读
        </Link>
      </div>
    </AppShell>
  )
}
