// Standalone seed script for the ClinKit Dashboard Brain tables.
// Run later via `tsx scripts/seed.ts` (or similar) once dependencies are installed.
// Safe to re-run: analysts/divisions use ON CONFLICT DO NOTHING on their
// unique name columns; dashboards use a manual existence check since the
// table has no unique constraint to target.

import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(databaseUrl);

const ANALYSTS = ['Robert', 'Ely', 'Steve', 'Becca', 'Vinay', 'Jay', 'Karen'];

const DIVISIONS = [
  'ACES PROGRAM',
  'ALLERGY AND IMMUNOLOGY',
  'ANESTHESIA',
  'AUDIOLOGY',
  'CARDIOLOGY',
  'CLEFT AND CRANIOFACIAL',
  'CRITICAL CARE',
  'CV SURGERY',
  'DERMATOLOGY',
  'DEVELOPMENTAL PEDS',
  'EMERGENCY MEDICINE',
  'ENDOCRINOLOGY',
  'FORENSICS',
  'GASTROENTEROLOGY',
  'GENERAL PEDIATRICS',
  'GENETICS',
  'GYNECOLOGY',
  'HEMATOLOGY ONCOLOGY',
  'HOMELESS YOUTH OUTREACH',
  'HOSPITALISTS',
  'INFECTIOUS DISEASES',
  'MENTAL HEALTH THERAPY',
  'NEONATOLOGY',
  'NEPHROLOGY',
  'NEUROLOGY',
  'NEUROPSYCHOLOGY',
  'NEUROSURGERY',
  'NO GROUP',
  'NUTRITION',
  'OPHTHALMOLOGY',
  'ORTHOPAEDICS',
  'OTOLARYNGOLOGY',
  'PALLIATIVE CARE',
  'PATHOLOGY',
  'PCP 1501 N GILBERT RD',
  'PCP CADENCE',
  'PCP CHANDLER',
  'PCP COTTONWOOD',
  'PCP DOBSON VILLAGE',
  'PCP GILBERT',
  'PCP NORTH PHOENIX',
  'PCP NORTHWEST VALLEY',
  'PCP PARADISE VALLEY',
  'PCP ROME TOWERS',
  'PCP SAN TAN',
  'PCP SAN TAN VILLAGE',
  'PCP SCOTTSDALE',
  'PCP TEMPE',
  'PEDIATRIC SURGERY',
  'PHYSICAL MEDICINE',
  'PLASTIC SURGERY',
  'PSYCHIATRY',
  'PSYCHOLOGY',
  'PULMONOLOGY',
  'RADIOLOGY',
  'REHAB',
  'RHEUMATOLOGY',
  'SPORTS PT',
  'UROLOGY',
];

const ROBERT_DASHBOARDS: Array<{ name: string; division: string }> = [
  { name: 'SLE', division: 'RHEUMATOLOGY' },
  { name: 'OSA', division: 'PULMONOLOGY' },
  { name: 'Palliative Care', division: 'PALLIATIVE CARE' },
  { name: 'Nephrology', division: 'NEPHROLOGY' },
  { name: 'HemOnc pre-admission', division: 'HEMATOLOGY ONCOLOGY' },
  { name: 'Adolescent Med/Eating Disorders', division: 'NO GROUP' },
  { name: 'KBMA', division: 'NO GROUP' },
  { name: 'Wound Tracking', division: 'NO GROUP' },
  { name: 'MAW', division: 'NO GROUP' },
];

const ROBERT_SUBSCRIPTIONS: Array<{ name: string; division: string }> = [
  { name: 'CCBD Expected Admits', division: 'HEMATOLOGY ONCOLOGY' },
];

async function main() {
  let analystsInserted = 0;
  for (const name of ANALYSTS) {
    const rows = await sql`
      INSERT INTO analysts (name)
      VALUES (${name})
      ON CONFLICT (name) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) analystsInserted++;
  }

  let divisionsInserted = 0;
  for (let i = 0; i < DIVISIONS.length; i++) {
    const rows = await sql`
      INSERT INTO divisions (name, sort_order)
      VALUES (${DIVISIONS[i]}, ${i})
      ON CONFLICT (name) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) divisionsInserted++;
  }

  const robertRows = await sql`
    SELECT id FROM analysts WHERE name = 'Robert'
  `;
  if (robertRows.length === 0) {
    throw new Error('Analyst "Robert" not found after seeding analysts');
  }
  const robertId = robertRows[0].id as number;

  let dashboardsInserted = 0;
  for (const { name, division } of ROBERT_DASHBOARDS) {
    const divisionRows = await sql`
      SELECT id FROM divisions WHERE name = ${division}
    `;
    if (divisionRows.length === 0) {
      throw new Error(`Division "${division}" not found for dashboard "${name}"`);
    }
    const divisionId = divisionRows[0].id as number;

    // dashboards has no unique constraint to use as an ON CONFLICT target,
    // so idempotency is enforced manually: skip if a dashboard with this
    // name already exists for this division.
    const existing = await sql`
      SELECT id FROM dashboards WHERE name = ${name} AND division_id = ${divisionId}
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO dashboards (name, division_id, analyst_id)
        VALUES (${name}, ${divisionId}, ${robertId})
      `;
      dashboardsInserted++;
    }
  }

  let subscriptionsInserted = 0;
  for (const { name, division } of ROBERT_SUBSCRIPTIONS) {
    const divisionRows = await sql`
      SELECT id FROM divisions WHERE name = ${division}
    `;
    if (divisionRows.length === 0) {
      throw new Error(`Division "${division}" not found for subscription "${name}"`);
    }
    const divisionId = divisionRows[0].id as number;

    // report_subscriptions has no unique constraint to use as an ON CONFLICT
    // target, so idempotency is enforced manually: skip if a subscription
    // with this name already exists for this division.
    const existing = await sql`
      SELECT id FROM report_subscriptions WHERE name = ${name} AND division_id = ${divisionId}
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO report_subscriptions (name, division_id, analyst_id)
        VALUES (${name}, ${divisionId}, ${robertId})
      `;
      subscriptionsInserted++;
    }
  }

  console.log(
    `Seed complete: ${analystsInserted}/${ANALYSTS.length} analysts, ` +
      `${divisionsInserted}/${DIVISIONS.length} divisions, ` +
      `${dashboardsInserted}/${ROBERT_DASHBOARDS.length} dashboards, ` +
      `${subscriptionsInserted}/${ROBERT_SUBSCRIPTIONS.length} subscriptions inserted (new rows only).`
  );
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
