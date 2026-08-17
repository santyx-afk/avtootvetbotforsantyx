# Ma'lumotlar bazasi sxemasi — joriy holat (baseline)

> **Avtomatik olingan snapshot** (Supabase, public sxema) — 2026-08-16.
> Bu fayl migratsiyalar boshlanish nuqtasi: shu sanadan keyingi har bir sxema
> o'zgarishi alohida migratsiya fayli bilan qilinadi (README ga qarang).
> Kod bilan baza orasida nomuvofiqlik gumon qilinsa — shu faylga solishtiring.

Jadvallar soni: 42

## admin_login_attempts

_RLS: o'chirilgan · PK: ip_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| ip | text | yo'q |  |
| attempts | integer | yo'q | 0 |
| blocked_until | timestamp with time zone | ha |  |
| last_attempt | timestamp with time zone | yo'q | now() |

## admins

_RLS: yoqilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| username | text | ha |  |
| telegram_id (unique) | text | ha |  |
| created_at | timestamp with time zone | yo'q | now() |

## analytics_events

_RLS: yoqilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| event_type | text | yo'q |  |
| telegram_id | text | ha |  |
| category_id | uuid | ha |  |
| plan_id | uuid | ha |  |
| metadata | jsonb | yo'q | '{}'::jsonb |
| created_at | timestamp with time zone | yo'q | now() |

FK: plan_id → plans(id); category_id → categories(id)

## audit_logs

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| order_id | uuid | ha |  |
| user_telegram_id | text | ha |  |
| action | text | yo'q |  |
| status | text | ha |  |
| metadata | jsonb | yo'q | '{}'::jsonb |
| created_at | timestamp with time zone | yo'q | now() |

FK: order_id → orders(id)

## banners

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| title | text | ha |  |
| image_url | text | ha |  |
| link | text | ha |  |
| is_active | boolean | yo'q | true |
| sort_order | integer | yo'q | 1 |
| expires_at | timestamp with time zone | ha |  |
| created_at | timestamp with time zone | yo'q | now() |
| subtitle | text | ha |  |
| btn_text | text | ha |  |
| gradient | text | ha |  |

## cart_items

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| user_telegram_id | text | yo'q |  |
| plan_id | uuid | yo'q |  |
| quantity | integer | yo'q | 1 |
| created_at | timestamp with time zone | yo'q | now() |
| updated_at | timestamp with time zone | yo'q | now() |

FK: plan_id → plans(id)

## categories

_RLS: yoqilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| slug (unique) | text | yo'q |  |
| name | text | yo'q |  |
| button_label | text | ha |  |
| description | text | ha |  |
| sort_order | integer | yo'q | 1 |
| is_active | boolean | yo'q | true |
| created_at | timestamp with time zone | yo'q | now() |

FK: category_id → categories(id); category_id → categories(id); category_id → categories(id)

## chat_messages

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | nextval('chat_messages_id_seq'::regclass) |
| chat_id | integer | yo'q |  |
| sender_id | text | yo'q |  |
| message_type | text | ha | 'text'::text |
| content | text | ha |  |
| media_url | text | ha |  |
| media_thumbnail | text | ha |  |
| reply_to_id | integer | ha |  |
| is_reported | boolean | ha | false |
| report_reason | text | ha |  |
| created_at | timestamp with time zone | ha | now() |

FK: reply_to_id → chat_messages(id); message_id → chat_messages(id); chat_id → chats(id)

## chats

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | nextval('chats_id_seq'::regclass) |
| listing_id | integer | ha |  |
| client_id | text | yo'q |  |
| worker_user_id | text | yo'q |  |
| last_message_at | timestamp with time zone | ha | now() |
| created_at | timestamp with time zone | ha | now() |

FK: listing_id → listings(id); chat_id → chats(id); chat_id → chats(id); chat_id → chats(id)

## checks

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | extensions.uuid_generate_v4() |
| check_code (unique) | text | yo'q |  |
| order_id | text | yo'q |  |
| original_amount | numeric | yo'q |  |
| amount | numeric | yo'q |  |
| url | text | yo'q |  |
| post | jsonb | ha |  |
| status | text | yo'q | 'active'::text |
| created_at | timestamp with time zone | ha | now() |

## delivery_logs

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| order_id | uuid | ha |  |
| user_telegram_id | text | ha |  |
| plan_id | uuid | ha |  |
| inventory_item_id | uuid | ha |  |
| delivery_type | text | ha |  |
| delivered_at | timestamp with time zone | ha |  |
| admin_telegram_id | text | ha |  |
| status | text | yo'q |  |
| error_message | text | ha |  |
| created_at | timestamp with time zone | yo'q | now() |

FK: order_id → orders(id); inventory_item_id → inventory_items(id); plan_id → plans(id)

## delivery_retry_queue

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| order_id (unique) | uuid | yo'q |  |
| reason | text | yo'q |  |
| status | text | yo'q | 'pending'::text |
| retry_count | integer | yo'q | 0 |
| next_retry_at | timestamp with time zone | yo'q | now() |
| metadata | jsonb | yo'q | '{}'::jsonb |
| created_at | timestamp with time zone | yo'q | now() |
| updated_at | timestamp with time zone | yo'q | now() |
| completed_at | timestamp with time zone | ha |  |

FK: order_id → orders(id)

## exception_queue

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| order_id | uuid | ha |  |
| reason | text | yo'q |  |
| status | text | yo'q | 'open'::text |
| metadata | jsonb | yo'q | '{}'::jsonb |
| created_at | timestamp with time zone | yo'q | now() |
| resolved_at | timestamp with time zone | ha |  |

FK: order_id → orders(id)

## faq

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| question | text | yo'q |  |
| answer | text | yo'q |  |
| lang | text | ha |  |
| sort_order | integer | yo'q | 1 |
| is_active | boolean | yo'q | true |
| created_at | timestamp with time zone | yo'q | now() |

## freelance_orders

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | nextval('freelance_orders_id_seq'::regclass) |
| chat_id | integer | yo'q |  |
| created_by | text | yo'q |  |
| client_id | text | yo'q |  |
| worker_user_id | text | yo'q |  |
| listing_id | integer | ha |  |
| title | text | yo'q |  |
| description | text | yo'q |  |
| format | text | ha |  |
| reference_urls | ARRAY | ha | '{}'::text[] |
| notes | text | ha |  |
| amount | integer | yo'q |  |
| commission | integer | yo'q | 0 |
| worker_amount | integer | yo'q | 0 |
| deadline_hours | numeric | yo'q |  |
| deadline_at | timestamp with time zone | ha |  |
| first_payment | integer | ha | 0 |
| second_payment | integer | ha | 0 |
| first_payment_status | text | ha | 'pending'::text |
| second_payment_status | text | ha | 'pending'::text |
| worker_paid | boolean | ha | false |
| has_source_materials | boolean | ha | false |
| source_materials_sent | boolean | ha | false |
| result_media_url | text | ha |  |
| revision_count | integer | ha | 0 |
| counter_offer_count | integer | ha | 0 |
| parent_order_id | integer | ha |  |
| status | text | ha | 'created'::text |
| deadline_warning_sent | boolean | ha | false |
| deadline_expired | boolean | ha | false |
| unique_price | integer | ha |  |
| created_at | timestamp with time zone | ha | now() |
| updated_at | timestamp with time zone | ha | now() |
| payment_stage | text | ha |  |
| payment_expires_at | timestamp with time zone | ha |  |
| first_paid_at | timestamp with time zone | ha |  |
| second_paid_at | timestamp with time zone | ha |  |
| deadline_extended_count | integer | ha | 0 |
| refund_amount | integer | ha | 0 |
| cancel_reason | text | ha |  |
| final_file_sent | boolean | ha | false |

FK: parent_order_id → freelance_orders(id); order_id → freelance_orders(id); order_id → freelance_orders(id); chat_id → chats(id); listing_id → listings(id); order_id → freelance_orders(id)

## freelance_reports

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | nextval('freelance_reports_id_seq'::regclass) |
| order_id | integer | ha |  |
| chat_id | integer | ha |  |
| message_id | integer | ha |  |
| reporter_id | text | yo'q |  |
| reported_id | text | yo'q |  |
| reason | text | yo'q |  |
| status | text | ha | 'pending'::text |
| admin_notes | text | ha |  |
| created_at | timestamp with time zone | ha | now() |
| resolution | text | ha |  |
| resolved_by | text | ha |  |
| resolved_at | timestamp with time zone | ha |  |

FK: message_id → chat_messages(id); order_id → freelance_orders(id); chat_id → chats(id)

## freelance_reviews

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | nextval('freelance_reviews_id_seq'::regclass) |
| order_id | integer | yo'q |  |
| reviewer_id | text | yo'q |  |
| reviewed_id | text | yo'q |  |
| reviewer_role | text | yo'q |  |
| rating | integer | yo'q |  |
| comment | text | ha |  |
| is_visible | boolean | ha | true |
| created_at | timestamp with time zone | ha | now() |

FK: order_id → freelance_orders(id)

## inventory_items

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| plan_id | uuid | yo'q |  |
| type | text | yo'q |  |
| title | text | ha |  |
| login | text | ha |  |
| password_encrypted | text | ha |  |
| license_key_encrypted | text | ha |  |
| extra_data_encrypted | text | ha |  |
| status | text | yo'q | 'available'::text |
| assigned_order_id | uuid | ha |  |
| assigned_user_telegram_id | text | ha |  |
| created_at | timestamp with time zone | yo'q | now() |
| reserved_at | timestamp with time zone | ha |  |
| delivered_at | timestamp with time zone | ha |  |
| sold_at | timestamp with time zone | ha |  |
| notes | text | ha |  |

FK: inventory_item_id → inventory_items(id); plan_id → plans(id); assigned_order_id → orders(id); inventory_item_id → inventory_items(id); inventory_item_id → inventory_items(id)

## listings

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | nextval('listings_id_seq'::regclass) |
| worker_id | integer | yo'q |  |
| title | text | yo'q |  |
| description | text | yo'q |  |
| category | text | yo'q |  |
| min_price | integer | yo'q |  |
| is_published | boolean | ha | false |
| is_hidden | boolean | ha | false |
| created_at | timestamp with time zone | ha | now() |
| updated_at | timestamp with time zone | ha | now() |
| is_archived | boolean | ha | false |
| archived_at | timestamp with time zone | ha |  |

FK: listing_id → listings(id); worker_id → workers(id); listing_id → listings(id)

## monitoring_snapshots

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | 1 |
| orders_today | integer | yo'q | 0 |
| revenue_today | numeric | yo'q | 0 |
| retries_today | integer | yo'q | 0 |
| failed_deliveries | integer | yo'q | 0 |
| updated_at | timestamp with time zone | yo'q | now() |

## order_items

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| order_id | uuid | yo'q |  |
| user_telegram_id | text | yo'q |  |
| plan_id | uuid | ha |  |
| quantity | integer | yo'q | 1 |
| unit_price | numeric | yo'q | 0 |
| total_price | numeric | yo'q | 0 |
| created_at | timestamp with time zone | yo'q | now() |
| inventory_item_id | uuid | ha |  |
| delivery_status | text | yo'q | 'pending'::text |
| delivery_error | text | ha |  |
| delivered_at | timestamp with time zone | ha |  |
| updated_at | timestamp with time zone | yo'q | now() |

FK: order_id → orders(id); inventory_item_id → inventory_items(id); plan_id → plans(id)

## orders

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| order_number (unique) | text | yo'q |  |
| user_id | uuid | ha |  |
| user_telegram_id | text | yo'q |  |
| plan_id | uuid | ha |  |
| amount | numeric | yo'q | 0 |
| status | text | yo'q | 'pending_payment'::text |
| payment_method | text | ha |  |
| receipt_submission_id | bigint | ha |  |
| receipt_file_id | text | ha |  |
| receipt_file_type | text | ha |  |
| admin_comment | text | ha |  |
| delivery_status | text | yo'q | 'waiting_approval'::text |
| inventory_item_id | uuid | ha |  |
| created_at | timestamp with time zone | yo'q | now() |
| updated_at | timestamp with time zone | yo'q | now() |
| receipt_uploaded_at | timestamp with time zone | ha |  |
| approved_at | timestamp with time zone | ha |  |
| rejected_at | timestamp with time zone | ha |  |
| completed_at | timestamp with time zone | ha |  |
| delivered_at | timestamp with time zone | ha |  |
| base_price | numeric | ha |  |
| unique_price | numeric | ha |  |
| expires_at | timestamp with time zone | ha |  |
| paid_at | timestamp with time zone | ha |  |
| payment_source | text | ha |  |
| payment_message_id | text | ha |  |
| delivery_attempts | integer | yo'q | 0 |
| delivery_error | text | ha |  |
| promo_code | text | ha |  |
| discount_amount | numeric | yo'q | 0 |
| balance_used | numeric | yo'q | 0 |
| check_code | text | ha |  |
| expected_amount | numeric | ha |  |
| order_type | text | yo'q | 'purchase'::text |
| topup_credit | numeric | ha |  |
| cashback_amount | numeric | yo'q | 0 |

FK: order_id → orders(id); first_order_id → orders(id); plan_id → plans(id); order_id → orders(id); receipt_submission_id → receipt_submissions(id); order_id → orders(id); order_id → orders(id); user_id → users(id); order_id → orders(id); assigned_order_id → orders(id); order_id → orders(id); inventory_item_id → inventory_items(id); order_id → orders(id); order_id → orders(id); order_id → orders(id)

## payment_logs

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| source | text | yo'q |  |
| message_key | text | ha |  |
| amount | numeric | ha |  |
| order_id | uuid | ha |  |
| status | text | yo'q |  |
| raw_payload | jsonb | yo'q | '{}'::jsonb |
| created_at | timestamp with time zone | yo'q | now() |
| user_telegram_id | text | ha |  |
| base_price | numeric | ha |  |
| paid_amount | numeric | ha |  |
| delivery_status | text | ha |  |
| products | jsonb | yo'q | '[]'::jsonb |

FK: order_id → orders(id)

## plans

_RLS: yoqilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| category_id | uuid | yo'q |  |
| parent_plan_id | uuid | ha |  |
| name | text | yo'q |  |
| button_label | text | ha |  |
| price | numeric | yo'q | 0 |
| currency | text | yo'q | 'UZS'::text |
| duration | text | ha |  |
| warranty_text | text | ha |  |
| description | text | ha |  |
| how_it_works_text | text | ha |  |
| payment_instructions | text | ha |  |
| rules_text | text | ha |  |
| sort_order | integer | yo'q | 1 |
| is_active | boolean | yo'q | true |
| created_at | timestamp with time zone | yo'q | now() |
| delivery_type | text | yo'q | 'manual'::text |
| delivery_instructions | text | ha |  |
| old_price | numeric | ha |  |
| is_popular | boolean | yo'q | false |
| tags | ARRAY | yo'q | '{}'::text[] |
| image_url | text | ha |  |
| official_price | numeric | ha |  |

FK: plan_id → plans(id); category_id → categories(id); parent_plan_id → plans(id); plan_id → plans(id); plan_id → plans(id); plan_id → plans(id); plan_id → plans(id); plan_id → plans(id); plan_id → plans(id); plan_id → plans(id); plan_id → plans(id); plan_id → plans(id); plan_id → plans(id)

## processed_payment_messages

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| source | text | yo'q |  |
| message_key | text | yo'q |  |
| amount | numeric | ha |  |
| raw_payload | jsonb | yo'q | '{}'::jsonb |
| created_at | timestamp with time zone | yo'q | now() |

## promo_codes

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| code (unique) | text | yo'q |  |
| discount_type | text | yo'q |  |
| discount_value | numeric | yo'q | 0 |
| is_one_time | boolean | yo'q | false |
| max_uses | integer | ha |  |
| used_count | integer | yo'q | 0 |
| expires_at | timestamp with time zone | ha |  |
| is_active | boolean | yo'q | true |
| created_at | timestamp with time zone | yo'q | now() |
| min_order_amount | numeric | yo'q | 0 |

## receipt_submissions

_RLS: yoqilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| telegram_id | text | yo'q |  |
| category_id | uuid | ha |  |
| plan_id | uuid | ha |  |
| telegram_message_id | text | ha |  |
| payload | jsonb | yo'q | '{}'::jsonb |
| created_at | timestamp with time zone | yo'q | now() |
| order_id | uuid | ha |  |

FK: category_id → categories(id); plan_id → plans(id); receipt_submission_id → receipt_submissions(id); order_id → orders(id)

## referrals

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| referrer_telegram_id | text | yo'q |  |
| referred_telegram_id (unique) | text | yo'q |  |
| status | text | yo'q | 'registered'::text |
| reward_type | text | ha |  |
| reward_value | numeric | ha |  |
| first_order_id | uuid | ha |  |
| created_at | timestamp with time zone | yo'q | now() |
| rewarded_at | timestamp with time zone | ha |  |
| total_earned | numeric | ha | 0 |
| purchase_count | integer | ha | 0 |
| updated_at | timestamp with time zone | ha | now() |

FK: first_order_id → orders(id)

## reviews

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| plan_id | uuid | yo'q |  |
| user_telegram_id | text | yo'q |  |
| user_name | text | ha |  |
| rating | integer | yo'q |  |
| text | text | ha |  |
| admin_reply | text | ha |  |
| is_hidden | boolean | yo'q | false |
| created_at | timestamp with time zone | yo'q | now() |
| updated_at | timestamp with time zone | yo'q | now() |
| status | text | ha | 'approved'::text |
| order_id | uuid | ha |  |

FK: plan_id → plans(id)

## settings

_RLS: yoqilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | 1 |
| seller_card_number | text | ha |  |
| seller_display_name | text | ha |  |
| admin_telegram_id | text | ha |  |
| welcome_text | text | ha |  |
| contact_text | text | ha |  |
| support_link | text | ha |  |
| created_at | timestamp with time zone | yo'q | now() |
| updated_at | timestamp with time zone | yo'q | now() |
| general_terms | text | ha |  |
| cashback_enabled | boolean | yo'q | false |
| cashback_percent | numeric | yo'q | 10 |
| referral_percent | numeric | yo'q | 10 |
| referral_fixed_bonus | numeric | yo'q | 0 |
| min_topup | numeric | yo'q | 5000 |
| birthday_discount_percent | numeric | yo'q | 10 |

## stock_waitlist

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| user_telegram_id | text | yo'q |  |
| plan_id | uuid | yo'q |  |
| notified | boolean | yo'q | false |
| created_at | timestamp with time zone | yo'q | now() |

FK: plan_id → plans(id)

## subscriptions

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q | nextval('subscriptions_id_seq'::regclass) |
| user_id | bigint | ha |  |
| order_id (unique) | uuid | ha |  |
| product_id | text | ha |  |
| product_name | text | ha |  |
| status | character varying | ha | 'active'::character varying |
| duration_days | integer | ha | 30 |
| starts_at | timestamp with time zone | ha | now() |
| expires_at | timestamp with time zone | yo'q |  |
| end_date | date | ha | ((expires_at AT TIME ZONE 'UTC'::text))::date |
| created_at | timestamp with time zone | ha | now() |
| updated_at | timestamp with time zone | ha | now() |
| user_telegram_id | text | ha |  |
| plan_id | uuid | ha |  |
| plan_name | text | ha |  |
| started_at | timestamp with time zone | ha | now() |
| reminder_3d_sent | boolean | yo'q | false |
| reminder_1d_sent | boolean | yo'q | false |
| expired_notified | boolean | yo'q | false |

FK: order_id → orders(id)

## user_states

_RLS: yoqilgan · PK: telegram_id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| telegram_id | text | yo'q |  |
| state | jsonb | yo'q | '{}'::jsonb |
| updated_at | timestamp with time zone | yo'q | now() |

## user_wallets

_RLS: o'chirilgan · PK: user_telegram_id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| user_telegram_id | text | yo'q |  |
| balance | numeric | yo'q | 0 |
| updated_at | timestamp with time zone | yo'q | now() |

## user_wishlist

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| user_telegram_id | text | yo'q |  |
| plan_id | uuid | yo'q |  |
| created_at | timestamp with time zone | yo'q | now() |

FK: plan_id → plans(id)

## users

_RLS: yoqilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| telegram_id (unique) | text | yo'q |  |
| username | text | ha |  |
| full_name | text | ha |  |
| language_code | text | ha |  |
| created_at | timestamp with time zone | yo'q | now() |
| updated_at | timestamp with time zone | yo'q | now() |
| phone | text | ha |  |
| birthday | date | ha |  |
| photo_url | text | ha |  |
| webapp_lang | text | ha |  |
| is_blocked | boolean | ha | false |

FK: user_id → users(id)

## vacancy_pending_files

_RLS: yoqilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | nextval('vacancy_pending_files_id_seq'::regclass) |
| order_id | integer | yo'q |  |
| sender_id | text | yo'q |  |
| tg_chat_id | text | yo'q |  |
| tg_message_id | bigint | yo'q |  |
| kind | text | yo'q | 'material'::text |
| forwarded | boolean | ha | false |
| created_at | timestamp with time zone | ha | now() |

FK: order_id → freelance_orders(id)

## wallet_transactions

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| user_telegram_id | text | yo'q |  |
| order_id | uuid | ha |  |
| amount | numeric | yo'q |  |
| type | text | yo'q |  |
| description | text | ha |  |
| created_at | timestamp with time zone | yo'q | now() |
| admin_id | text | ha |  |

FK: order_id → orders(id)

## web_auth_codes

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | bigint | yo'q |  |
| telegram_id | text | yo'q |  |
| code | text | yo'q |  |
| expires_at | timestamp with time zone | yo'q |  |
| used | boolean | yo'q | false |
| created_at | timestamp with time zone | yo'q | now() |

## wishlist

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | uuid | yo'q | gen_random_uuid() |
| user_telegram_id | text | yo'q |  |
| plan_id | uuid | yo'q |  |
| created_at | timestamp with time zone | yo'q | now() |
| price_at_add | numeric | ha |  |

FK: plan_id → plans(id)

## worker_verification

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | nextval('worker_verification_id_seq'::regclass) |
| phone | text | yo'q |  |
| code | text | yo'q |  |
| user_id | text | ha |  |
| status | text | ha | 'pending'::text |
| created_at | timestamp with time zone | ha | now() |
| expires_at | timestamp with time zone | ha | (now() + '00:30:00'::interval) |

## workers

_RLS: o'chirilgan · PK: id_

| Ustun | Turi | Nullable | Default |
|---|---|---|---|
| id | integer | yo'q | nextval('workers_id_seq'::regclass) |
| user_id (unique) | text | yo'q |  |
| phone | text | yo'q |  |
| name | text | yo'q |  |
| bio | text | ha |  |
| categories | ARRAY | yo'q | '{}'::text[] |
| portfolio_urls | ARRAY | ha | '{}'::text[] |
| show_phone | boolean | ha | false |
| card_number | text | ha |  |
| work_schedule | jsonb | ha | '{}'::jsonb |
| is_busy | boolean | ha | false |
| is_approved | boolean | ha | false |
| is_banned | boolean | ha | false |
| ban_reason | text | ha |  |
| banned_until | timestamp with time zone | ha |  |
| experience_years | integer | ha | 0 |
| avg_rating | numeric | ha | 0 |
| total_reviews | integer | ha | 0 |
| completed_orders | integer | ha | 0 |
| total_earnings | integer | ha | 0 |
| deadline_violations | integer | ha | 0 |
| rules_accepted | boolean | ha | false |
| created_at | timestamp with time zone | ha | now() |
| updated_at | timestamp with time zone | ha | now() |
| rating_penalty | numeric | ha | 0 |

FK: worker_id → workers(id)
