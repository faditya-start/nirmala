import type { ReactNode } from "react";
import styles from "./Section.module.css";

/** S3 section heading: 16 px title with an optional 13 px description, 12 px above the content. */
export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {children}
    </section>
  );
}
