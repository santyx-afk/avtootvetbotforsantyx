import { haptic } from '../telegram/webapp.js';
import styles from './Toggle.module.css';

// iOS uslubidagi switch.
export default function Toggle({ checked, onChange, disabled = false }) {
  const toggle = () => {
    if (disabled) return;
    haptic.selection();
    onChange?.(!checked);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle} ${checked ? styles.on : ''} ${disabled ? styles.disabled : ''}`}
      onClick={toggle}
    >
      <span className={styles.knob} />
    </button>
  );
}
