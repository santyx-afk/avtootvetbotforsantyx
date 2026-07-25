import { createClient } from '@supabase/supabase-js';

// Browser (anon) Supabase client.
// Faqat public (RLS ostidagi) o'qish va Storage URL'lari uchun.
// Maxfiy operatsiyalar (buyurtma, telefon saqlash) webapp-api funksiyasi orqali,
// service_role key bilan bajariladi.

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const hasSupabase = Boolean(supabase);

if (!hasSupabase && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY o\'rnatilmagan — to\'g\'ridan-to\'g\'ri client o\'chirilgan.',
  );
}
