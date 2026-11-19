/**
 * Writes seeds/sample-data.sql from the defaults in lib/ (settings, tone, prompts, sample FAQ)
 * and docs/sample-faq.csv. Run after changing a default:  npx tsx scripts/generate-seed.ts
 * A unit test fails if the committed files are out of date.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildSeedSql, buildSampleCsv } from '../lib/seed-source';

const root = path.resolve(__dirname, '..');
writeFileSync(path.join(root, 'seeds', 'sample-data.sql'), buildSeedSql());
writeFileSync(path.join(root, 'docs', 'sample-faq.csv'), buildSampleCsv());
console.log('wrote seeds/sample-data.sql and docs/sample-faq.csv');
