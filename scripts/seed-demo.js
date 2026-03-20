const { getAdminClient } = require('../shared/db');
const { seedDemoData } = require('../shared/seed');

(async () => {
  const supabase = getAdminClient();
  await seedDemoData(supabase);
  console.log('Demo data seeded successfully.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
