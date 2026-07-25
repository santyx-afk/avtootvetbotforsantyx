import { Component } from 'react';

// Render paytidagi kutilmagan xatolarni ushlab qoladi (oxirgi himoya chizig'i).
// Kontekstga bog'liq bo'lmasligi uchun fallback o'zi-yetarli (i18n ishlatmaydi).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('App crashed:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          minHeight: '80vh',
          padding: '24px',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '40px' }}>⚠️</div>
        <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Xatolik yuz berdi</h3>
        <p style={{ fontSize: '14px', color: 'var(--app-hint)', maxWidth: 300 }}>
          Ilovani qayta yuklang. Muammo davom etsa, birozdan so'ng urinib ko'ring.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="pressable"
          style={{
            marginTop: '8px',
            padding: '12px 28px',
            borderRadius: 'var(--app-radius)',
            background: 'var(--app-accent)',
            color: 'var(--app-accent-text)',
            fontSize: '15px',
            fontWeight: 600,
          }}
        >
          Qayta yuklash
        </button>
      </div>
    );
  }
}
