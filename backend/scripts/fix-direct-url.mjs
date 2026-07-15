import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL missing');

const path = '.env';
let content = readFileSync(path, 'utf8');
const escaped = dbUrl.replace(/"/g, '');
content = content.replace(/^DIRECT_URL=.*$/m, `DIRECT_URL="${escaped}"`);
writeFileSync(path, content);
console.log('Updated DIRECT_URL to session pooler URL');
