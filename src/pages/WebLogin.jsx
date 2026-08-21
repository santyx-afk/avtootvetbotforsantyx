import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall, setToken } from '../lib/api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import usePageMeta from '../hooks/usePageMeta.js';
import styles from './WebLogin.module.css';

const BOT = (import.meta.env.VITE_BOT_USERNAME || 'santyxnarxbot').replace(/^@/, '');
const BOT_LOGIN_URL = `https://t.me/${BOT}?start=web_login`;

// Kod uzunligi serverdagi CODE_LENGTH bilan bir xil bo'lishi kerak
// (shared/web-auth-service.js). 8 xonali — taxmin qilishga qarshi.
const CODE_LENGTH = 8;
const EMPTY_DIGITS = Array(CODE_LENGTH).fill('');

// Brauzer orqali Telegram login: kod olish -> kodni kiritish -> JWT.
export default function WebLogin({ onSuccess }) {
  const navigate = useNavigate();
  usePageMeta({
    title: 'Saytga kirish — santyx',
    description: 'Telegram orqali xavfsiz kiring.',
    path: '/login',
  });
  const [digits, setDigits] = useState(EMPTY_DIGITS);
  const [status, setStatus] = useState('idle'); // idle | verifying | error
  const [error, setError] = useState('');
  const inputs = useRef([]);

  const openBot = () => {
    window.open(BOT_LOGIN_URL, '_blank', 'noopener');
  };

  const verify = async (code) => {
    if (code.length !== CODE_LENGTH) return;
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
        too_many_attempts: 'Juda ko’p urinish. Bir oz kutib, qayta urinib ko’ring.',
      };
      setError(map[err?.message] || 'Kod noto‘g‘ri yoki muddati tugagan');
      setStatus('error');
      setDigits(EMPTY_DIGITS);
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
      if (idx > CODE_LENGTH - 1) break;
      next[idx] = ch;
      idx += 1;
    }
    setDigits(next);
    if (status === 'error') setStatus('idle');
    const focusIdx = Math.min(idx, CODE_LENGTH - 1);
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
          Telegram orqali xavfsiz kiring. Bot sizga {CODE_LENGTH} xonali kod yuboradi.
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
            <div>Kelgan {CODE_LENGTH} xonali kodni kiriting</div>
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
              maxLength={CODE_LENGTH}
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
          disabled={code.length !== CODE_LENGTH || status === 'verifying'}
        >
          {status === 'verifying' ? 'Tekshirilmoqda…' : 'Kirish'}
        </button>
      </div>
    </div>
  );
}
