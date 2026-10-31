import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables (assumes .env is processed elsewhere or use process.env)
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5433/gamerbooker_dev';

async function runSeed() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const seedFile = path.resolve(__dirname, '..', 'migrations', '0006_fixture_seeds.sql');
    const sql = fs.readFileSync(seedFile, { encoding: 'utf8' });
    await client.query(sql);
    console.log('✅ Fixture seeds applied successfully');
  } finally {
    await client.end();
  }
}

runSeed().catch(err => {
  console.error('❌ Seed script failed', err);
  process.exit(1);
});
