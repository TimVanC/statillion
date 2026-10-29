import Link from "next/link";
import styles from "./start.module.css";

export default function StartPage() {
  return (
    <main className={styles.main}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>STATILLION</h1>
        <p className={styles.tagline}>One in a statillion.</p>
      </div>
      <p className={styles.blurb}>
        7 sports prompts. 25 seconds each. Obvious answers barely move you.
        Deep cuts send your runner toward the marathon line.
      </p>
      <Link href="/play" className={styles.startButton}>
        Start today&apos;s run
      </Link>
      <div className={styles.footerLinks}>
        <span className={styles.linkDisabled}>Archive (soon)</span>
        <span className={styles.linkDisabled}>Unlimited (soon)</span>
      </div>
    </main>
  );
}
