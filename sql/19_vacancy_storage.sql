-- ============================================================
-- Vakansiya moduli — chat media uchun YOPIQ storage bucket.
-- Public emas: fayllar faqat service_role tomonidan yaratilgan
-- qisqa muddatli (30 daqiqa) imzolangan havola orqali ochiladi.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('vacancy-media', 'vacancy-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Anon/authenticated rollar uchun policy YO'Q — bu ataylab.
-- Barcha o'qish/yozish vacancy-api funksiyasi orqali service_role kaliti bilan
-- bajariladi, shuning uchun to'g'ridan-to'g'ri URL bilan yuklab bo'lmaydi.
