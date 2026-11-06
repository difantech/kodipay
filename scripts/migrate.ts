/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { query, isNeonConfigured } from '../server/db/connection.ts';
import { runMigrations } from '../server/db/schema.ts';

dotenv.config();

async function run() {
  console.log('====================================================');
  console.log('KODIPAY KENYA — NEON POSTGRESQL MIGRATION RUNNER');
  console.log('====================================================\n');

  if (isNeonConfigured()) {
    console.log('Connecting to Neon PostgreSQL serverless instance...');
  } else {
    console.log('DATABASE_URL not set — running against local development database.');
  }

  try {
    await runMigrations();

    console.log('\nVerifying database tables & core integrity:');
    const tablesCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name ASC
    `);

    console.log(`Found ${tablesCheck.rows.length} production database tables:`);
    for (const r of tablesCheck.rows) {
      console.log(` - ${r.table_name}`);
    }

    console.log('\nDatabase migration completed successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('\nDatabase migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
