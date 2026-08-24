const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

// Minimal, lekin foydali ESLint sozlamasi.
// Asosiy maqsad — jimgina buziladigan xatolarni ushlash: React hook
// qoidalarining buzilishi, useEffect bog'liqliklarining yetishmasligi va
// ishlatilmagan o'zgaruvchilar. Uslub (formatting) qoidalari ataylab yo'q.
module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', '.netlify/**'],
  },

  // ---- Frontend (React, ESM, brauzer) ----
  {
    files: ['src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // JSX transform yangi — React'ni import qilish shart emas
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Yangi eksperimental React Compiler qoidasi. Bu loyihada u haqiqiy
      // muammoni emas, qonuniy naqshni belgilaydi: tashqi tizim (Telegram SDK,
      // vacancyCall) bilan sinxronlashda effekt ichida setState chaqirish
      // React hujjatlarida ham tavsiya etilgan yo'l. Shuning uchun o'chirilgan.
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // ---- Admin panel (klassik brauzer skripti, modul emas) ----
  // Ilgari butunlay e'tiborsiz qoldirilgandi (`ignores` ro'yxatida edi). Admin
  // panel eng ko'p qo'l bilan yoziladigan joy, shuning uchun u ham tekshiruvdan
  // o'tsin. `sourceType: 'script'` — bu yerda import/export yo'q; Chart esa
  // CDN'dan keladi.
  {
    files: ['admin/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser, Chart: 'readonly' },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // ---- Backend (Netlify funksiyalari, CommonJS, Node) ----
  {
    files: ['netlify/**/*.js', 'shared/**/*.js', 'scripts/**/*.js', 'test/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
