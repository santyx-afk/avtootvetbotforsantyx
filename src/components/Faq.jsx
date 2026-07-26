import { useState } from 'react';
import Icon from './Icon.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './Faq.module.css';

// FAQ akkordeoni.
export default function Faq({ items = [] }) {
  const [open, setOpen] = useState(null);
  if (!items.length) return null;

  const toggle = (id) => {
    haptic.selection();
    setOpen((cur) => (cur === id ? null : id));
  };

  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const isOpen = open === item.id;
        return (
          <li key={item.id} className={styles.item}>
            <button type="button" className={styles.q} onClick={() => toggle(item.id)}>
              <span>{item.question}</span>
              <Icon
                name="chevronDown"
                size={18}
                className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
              />
            </button>
            {isOpen && <div className={styles.a}>{item.answer}</div>}
          </li>
        );
      })}
    </ul>
  );
}
