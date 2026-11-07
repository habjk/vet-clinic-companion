/**
 * Loads synthetic demo data: clinic settings, one staff login, owners, pets and vaccines.
 * All names and contact details are fake. Safe to re-run. Run: npm run seed
 */
import { encrypt } from '../src/crypto.js';
import { makeDeps } from '../src/deps.js';
import { env, need } from './_env.js';

need('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ENCRYPTION_KEY');
const { db } = makeDeps(env);
const key = env.ENCRYPTION_KEY;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const staffEmail = env.SEED_STAFF_EMAIL ?? 'frontdesk@riverside-vet.test';
const staffPassword = env.SEED_STAFF_PASSWORD ?? 'change-me-please-123';

/** Stops with Supabase's real error message instead of failing later on missing data. */
function ok<T>(result: { data: T | null; error: { message: string } | null }, step: string): NonNullable<T> {
  if (result.error) throw new Error(`${step} failed: ${result.error.message}`);
  if (result.data === null) throw new Error(`${step} returned no data`);
  return result.data as NonNullable<T>;
}

async function main() {
  // Checks the key format before anything is written.
  await encrypt('test', key);

  ok(
    await db
      .from('clinic_settings')
      .upsert({
        id: 1,
        clinic_name: 'Riverside Veterinary Clinic',
        clinic_phone: '(555) 010-2000',
        timezone: env.SEED_TIMEZONE ?? 'America/New_York',
        open_hour: 8,
        close_hour: 18,
        er_name: 'Northside Animal Emergency (demo)',
        er_phone: '(555) 010-9111',
        er_address: '400 Harbor Road',
      })
      .select('id'),
    'Saving clinic settings',
  );

  // Staff login for the dashboard.
  let userId: string | undefined;
  const created = await db.auth.admin.createUser({ email: staffEmail, password: staffPassword, email_confirm: true });
  if (created.data.user) userId = created.data.user.id;
  else {
    const list = await db.auth.admin.listUsers();
    userId = list.data.users.find((u) => u.email === staffEmail)?.id;
  }
  if (!userId) throw new Error(`Could not create or find staff user: ${created.error?.message}`);
  ok(await db.from('staff').upsert({ user_id: userId, display_name: 'Front desk' }).select('user_id'), 'Saving staff member');

  const households = [
    { name: 'Dana Whitfield', phone: '+1 555 010 1001', pets: [{ name: 'Max', species: 'Dog', breed: 'Labrador', vaccines: [['Rabies', 5], ['DHPP', 40]] }] },
    { name: 'Priya Raman', phone: '+1 555 010 1002', pets: [{ name: 'Mochi', species: 'Cat', breed: 'Domestic shorthair', vaccines: [['FVRCP', 9]] }, { name: 'Pepper', species: 'Cat', breed: null, vaccines: [['Rabies', 120]] }] },
    { name: 'Marcus Bell', phone: '+1 555 010 1003', pets: [{ name: 'Juniper', species: 'Dog', breed: 'Border collie', vaccines: [['Leptospirosis', -3], ['Bordetella', 12]] }] },
    { name: 'Sofia Alvarez', phone: '+1 555 010 1004', pets: [{ name: 'Biscuit', species: 'Rabbit', breed: 'Holland lop', vaccines: [['RHDV2', 20]] }] },
  ] as const;

  const links: string[] = [];
  for (const h of households) {
    const found = await db.from('owners').select('id, telegram_link_token').eq('full_name', h.name).maybeSingle();
    if (found.error) throw new Error(`Looking up owner ${h.name} failed: ${found.error.message}`);
    const owner =
      found.data ??
      ok(
        await db
          .from('owners')
          .insert({ full_name: h.name, phone_enc: await encrypt(h.phone, key) })
          .select('id, telegram_link_token')
          .single(),
        `Creating owner ${h.name}`,
      );

    for (const p of h.pets) {
      const hasPet = await db.from('pets').select('id').eq('owner_id', owner.id).eq('name', p.name).maybeSingle();
      if (hasPet.error) throw new Error(`Looking up pet ${p.name} failed: ${hasPet.error.message}`);
      if (hasPet.data) continue;
      const pet = ok(
        await db.from('pets').insert({ owner_id: owner.id, name: p.name, species: p.species, breed: p.breed }).select('id').single(),
        `Creating pet ${p.name}`,
      ) as { id: string };
      ok(
        await db
          .from('vaccinations')
          .insert(p.vaccines.map(([vaccine, offset]) => ({ pet_id: pet.id, vaccine, due_on: day(offset) })))
          .select('id'),
        `Adding vaccines for ${p.name}`,
      );
    }
    const bot = env.TELEGRAM_BOT_USERNAME ?? '<your_bot_username>';
    links.push(`  ${h.name.padEnd(16)} https://t.me/${bot}?start=${owner.telegram_link_token}`);
  }

  console.log('\nOwner opt-in links (open one in Telegram to link it to your own account):');
  console.log(links.join('\n'));
  console.log(`\nDashboard login: ${staffEmail} / ${staffPassword}`);
  console.log('Done. Tip: log a procedure for Juniper in the dashboard to schedule post-op check-ins.\n');
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
