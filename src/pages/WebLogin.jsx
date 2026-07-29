import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall, setToken } from '../lib/api.js';
import styles from './WebLogin.module.css';

const BOT = (import.meta.env.VITE_BOT_USERNAME || 'santyxnarxbot').replace(/^@/, '');
const BOT_LOGIN_URL = `https://t.me/${BOT}?start=web_login`;

// Brauzer orqali Telegram login: kod olish -> kodni kiritish -> JWT.
export default function WebLogin({ onSuccess }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle'); // idle | verifying | error
  const [error, setError] = useState('');

  const openBot = () => {
    window.open(BOT_LOGIN_URL, '_blank', 'noopener');
  };

  const submit = async (e) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      setError('6 xonali kodni kiriting');
      setStatus('error');
      return;
    }
    setStatus('verifying');
    setError('');
    try {
      const res = await apiCall('verify-web-code', { code: clean });
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
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <button type="button" className={styles.back} onClick={() => navigate('/')}>
          ← Ortga
        </button>

        <div className={styles.logo}>santyx<span>PRO</span></div>
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
            <div>Kelgan 6 xonali kodni pastga kiriting</div>
          </li>
        </ol>

        <form onSubmit={submit} className={styles.form}>
          <input
            className={styles.codeInput}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              if (status === 'error') setStatus('idle');
            }}
          />
          {status === 'error' && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submit} disabled={status === 'verifying'}>
            {status === 'verifying' ? 'Tekshirilmoqda…' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}
