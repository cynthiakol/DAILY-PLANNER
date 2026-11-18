// Persistence. In the installed Windows app: SQLite file (planner.db in the app data folder) via tauri-plugin-sql.
// In a plain browser (dev/tests): localStorage. Same interface for both.
import type { State } from './lib';
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
let db: any;
async function sql() {
  if (db) return db;
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  db = await Database.load('sqlite:planner.db');
  await db.execute('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
  return db;
}
export async function load(): Promise<State | null> {
  let raw: string | null;
  if (isTauri) { const rows = await (await sql()).select("SELECT v FROM kv WHERE k='state'"); raw = rows[0]?.v ?? null; }
  else raw = localStorage.getItem('planner.state');
  if (raw === null) return null;
  const s = JSON.parse(raw); if (s?.version !== 1) throw new Error('Unknown data version in saved file.');
  return s as State;
}
export async function save(s: State): Promise<void> {
  const raw = JSON.stringify(s);
  if (isTauri) {
    const d = await sql(); // keep the previous version as a one-step safety net before overwriting
    await d.execute("INSERT OR REPLACE INTO kv(k,v) SELECT 'state_prev', v FROM kv WHERE k='state'");
    await d.execute("INSERT OR REPLACE INTO kv(k,v) VALUES('state',$1)", [raw]);
  } else localStorage.setItem('planner.state', raw);
}
