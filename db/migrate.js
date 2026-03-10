import fs from 'fs';
import path from 'path';
import { pool } from '../src/db.js';

const dir = path.resolve('db/migrations');
fs.mkdirSync(dir, { recursive: true });

const client = await pool.connect();
try {
  await client.query(`create table if not exists schema_migrations(
    id text primary key,
    applied_at timestamptz not null default now()
  )`);

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const id = f;
    const exists = await client.query('select 1 from schema_migrations where id=$1', [id]);
    if (exists.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations(id) values($1)', [id]);
      await client.query('commit');
      console.log('applied', id);
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  }
} finally {
  client.release();
  await pool.end();
}
