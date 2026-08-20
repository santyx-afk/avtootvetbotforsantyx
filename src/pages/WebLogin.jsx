import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall, setToken } from '../lib/api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import styles from './WebLogin.module.css';

const BOT = (import.meta.env.VITE_BOT_USERNAME || 'santyxnarxbot').replace(/^@/, '');
const BOT_LOGIN_URL = `https://t.me/${BOT}?start=web_login`;

// Brauzer orqali Telegram login: kod olish -> 6 xonali kodni kiritish -> JWT.
export default function WebLogin({ onSuccess }) {
  const navigate = useNavigate();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [status, setStatus] = useState('idle'); // idle | verifying | error
  const [error, setError] = useState('');
  const inputs = useRef([]);

  const openBot = () => {
    window.open(BOT_LOGIN_URL, '_blank', 'noopener');
  };

  const verify = async (code) => {
    if (code.length !== 6) return;
    setStatus('verifying');
    setError('');
    try {
      const res = await apiCall('verify-web-code', { code });
      if (res?.token) {
        setToken(res.token);
        onSuccess?.();
        navigate('/catalog', { replace: true });
      } else {
        throw new Error('no_token');
      }
    } catch (err) {
      const map = {
        bad_code: 'Kod formati noto‘g‘ri',
        not_found: 'Bunday kod topilmadi',
        expired: 'Kod muddati tugagan — yangi kod oling',
      };
      setError(map[err?.message] || 'Kod noto‘g‘ri yoki muddati tugagan');
      setStatus('error');
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    }
  };

  // Bitta katakka kiritish / paste — raqamlarni taqsimlaydi va keyingi katakka o'tadi.
  const handleChange = (i, value) => {
    const clean = String(value).replace(/\D/g, '');
    const next = [...digits];
    if (!clean) {
      next[i] = '';
      setDigits(next);
      return;
    }
    let idx = i;
    for (const ch of clean.split('')) {
      if (idx > 5) break;
      next[idx] = ch;
      idx += 1;
    }
    setDigits(next);
    if (status === 'error') setStatus('idle');
    const focusIdx = Math.min(idx, 5);
    inputs.current[focusIdx]?.focus();
    if (next.every((d) => d)) verify(next.join(''));
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const code = digits.join('');

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <button type="button" className={styles.back} onClick={() => navigate('/')}>
          ← Ortga
        </button>

        <BrandLogo variant="full" className={styles.logo} title="SANTYX — pro obunalar" />
        <h1 className={styles.title}>Saytga kirish</h1>
        <p className={styles.subtitle}>
          Telegram orqali xavfsiz kiring. Bot sizga 6 xonali kod yuboradi.
        </p>

        <ol className={styles.steps}>
          <li>
            <span className={styles.stepNo}>1</span>
            <div>
              Telegram botni oching va kod oling
              <button type="button" className={styles.tgBtn} onClick={openBot}>
                Telegram orqali kod olish
              </button>
            </div>
          </li>
          <li>
            <span className={styles.stepNo}>2</span>
            <div>Kelgan 6 xonali kodni kiriting</div>
          </li>
        </ol>

        <div className={styles.codeBoxes}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputs.current[i] = el)}
              className={styles.codeBox}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={6}
              value={d}
              disabled={status === 'verifying'}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
            />
          ))}
        </div>

        {status === 'error' && <p className={styles.error}>{error}</p>}

        <button
          type="button"
          className={styles.submit}
          onClick={() => verify(code)}
          disabled={code.length !== 6 || status === 'verifying'}
        >
          {status === 'verifying' ? 'Tekshirilmoqda…' : 'Kirish'}
        </button>
      </div>
    </div>
  );
}
