// Pure domain logic: dates, recurrence, templates, validation, import/export. No UI, no storage.
export type Status = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export interface Rule { type: 'daily' | 'weekly' | 'weekdays'; days: number[]; until?: string }
export interface Activity {
  id: string; title: string; notes: string; category: string; priority: Priority; status: Status;
  date: string; start?: string; end?: string; background?: boolean; order: number;
  rule?: Rule; overrides: Record<string, Status>; // per-date status for recurring series
}
export type TItem = Pick<Activity, 'title' | 'notes' | 'category' | 'priority' | 'start' | 'end' | 'background'>;
export interface Template { id: string; name: string; items: TItem[] }
export interface Settings { theme: 'dark' | 'light'; weekStart: 0 | 1 | 6 }
export interface State { version: 1; activities: Activity[]; templates: Template[]; categories: string[]; settings: Settings }

export const DEFAULT_CATS = ['Gaming', 'Exercise', 'School/Work', 'Personal', 'Chores', 'Entertainment'];
export const STATUSES: Status[] = ['not_started', 'in_progress', 'completed', 'skipped'];
export const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];
export const uid = () => crypto.randomUUID();

// ---- dates: always local calendar dates as YYYY-MM-DD strings (no timezone math) ----
export const pad = (n: number) => String(n).padStart(2, '0');
export const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => fmt(new Date());
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
export const addMonths = (s: string, n: number) => {
  const d = parse(s), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return fmt(d);
};
export const dow = (s: string) => parse(s).getDay();
export const weekStart = (s: string, ws: number) => addDays(s, -((dow(s) - ws + 7) % 7));
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
export const monthGrid = (s: string, ws: number) => { const st = weekStart(s.slice(0, 8) + '01', ws); return Array.from({ length: 42 }, (_, i) => addDays(st, i)); };
export const label = (s: string) => parse(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

// ---- recurrence: series are stored once and expanded per date, so nothing is ever duplicated ----
export function occursOn(a: Activity, d: string): boolean {
  if (!a.rule) return a.date === d;
  if (d < a.date || (a.rule.until && d > a.rule.until)) return false;
  if (a.rule.type === 'daily') return true;
  if (a.rule.type === 'weekly') return dow(d) === dow(a.date);
  return a.rule.days.includes(dow(d));
}
export const statusOn = (a: Activity, d: string): Status => (a.rule ? a.overrides[d] ?? 'not_started' : a.status); // never derived from the clock
export const itemsForDate = (s: State, d: string) => s.activities.filter(a => occursOn(a, d)).sort((a, b) => a.order - b.order);
export const nextOrder = (s: State) => s.activities.reduce((m, a) => Math.max(m, a.order + 1), 0);

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
/** Ids of time-blocked, non-background activities that overlap. Background/AFK tasks never conflict. */
export function conflicts(items: Activity[]): Set<string> {
  const t = items.filter(a => a.start && a.end && !a.background), out = new Set<string>();
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++)
    if (toMin(t[i].start!) < toMin(t[j].end!) && toMin(t[j].start!) < toMin(t[i].end!)) { out.add(t[i].id); out.add(t[j].id); }
  return out;
}

export function validateActivity(a: Activity): string | null {
  if (!a.title.trim()) return 'Title is required.';
  if (a.title.length > 120) return 'Title must be 120 characters or fewer.';
  if (!isDate(a.date)) return 'Date is not valid.';
  const tm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (a.start || a.end) {
    if (!a.start || !tm.test(a.start) || !a.end || !tm.test(a.end)) return 'Start and end times must be valid (HH:MM).';
    if (toMin(a.end) <= toMin(a.start)) return 'End time must be after the start time.';
  }
  if (a.rule) {
    if (a.rule.type === 'weekdays' && !a.rule.days.length) return 'Pick at least one weekday.';
    if (a.rule.until && (!isDate(a.rule.until) || a.rule.until < a.date)) return 'Repeat end date must be on or after the start date.';
  }
  return null;
}

// ---- state operations (all return new state) ----
export function reorder(s: State, id: string, d: string, dir: -1 | 1): State {
  const flex = itemsForDate(s, d).filter(a => !a.start), i = flex.findIndex(a => a.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= flex.length) return s;
  const ids = flex.map(a => a.id); [ids[i], ids[j]] = [ids[j], ids[i]];
  return { ...s, activities: s.activities.map(a => (ids.includes(a.id) ? { ...a, order: ids.indexOf(a.id) } : a)) };
}
export function duplicate(s: State, id: string): State {
  const a = s.activities.find(x => x.id === id); if (!a) return s;
  const c: Activity = { ...a, id: uid(), title: a.title + ' (copy)', order: nextOrder(s), status: 'not_started', overrides: {}, rule: a.rule && { ...a.rule, days: [...a.rule.days] } };
  return { ...s, activities: [...s.activities, c] };
}
export const templateFromDay = (s: State, d: string, name: string): State => ({
  ...s, templates: [...s.templates, { id: uid(), name, items: itemsForDate(s, d).map(a => ({ title: a.title, notes: a.notes, category: a.category, priority: a.priority, start: a.start, end: a.end, background: a.background })) }],
});
/** Applying creates brand-new independent activities; later edits never touch the template or other copies. */
export function applyTemplate(s: State, tid: string, d: string): State {
  const t = s.templates.find(x => x.id === tid); if (!t) return s;
  let o = nextOrder(s);
  const made = t.items.map(it => ({ ...it, id: uid(), date: d, status: 'not_started' as Status, order: o++, overrides: {} }));
  return { ...s, activities: [...s.activities, ...made] };
}

export function seed(t: string): State {
  const mk = (p: Partial<Activity>): Activity => ({ id: uid(), title: '', notes: '', category: 'Personal', priority: 'normal', status: 'not_started', date: t, order: 0, overrides: {}, ...p });
  const daily = { type: 'daily' as const, days: [] };
  const activities = [
    mk({ title: 'Roblox Anime Dice AFK', category: 'Gaming', background: true, rule: daily, order: 0, notes: 'Background task' }),
    mk({ title: 'AQW farming', category: 'Gaming', rule: daily, order: 1 }),
    mk({ title: 'WuWa dailies', category: 'Gaming', rule: daily, order: 2 }),
    mk({ title: 'Running', category: 'Exercise', priority: 'high', start: '06:30', end: '07:15', rule: { type: 'weekdays', days: [1, 3, 5] }, order: 3 }),
  ];
  const items = activities.filter(a => !a.start).map(a => ({ title: a.title, notes: a.notes, category: a.category, priority: a.priority, background: a.background }));
  return { version: 1, activities, templates: [{ id: uid(), name: 'Gaming dailies', items }], categories: [...DEFAULT_CATS], settings: { theme: 'dark', weekStart: 1 } };
}

// ---- backup / export ----
export function parseBackup(text: string): State {
  let o: any; try { o = JSON.parse(text); } catch { throw new Error('File is not valid JSON.'); }
  if (!o || o.version !== 1 || !Array.isArray(o.activities) || !Array.isArray(o.templates) || !Array.isArray(o.categories)) throw new Error('Not a Daily Planner backup.');
  const acts: Activity[] = o.activities.map((a: any) => ({ notes: '', category: 'Personal', priority: 'normal', status: 'not_started', order: 0, overrides: {}, ...a }));
  for (const a of acts) { const e = validateActivity(a); if (e) throw new Error(`Invalid activity "${a?.title}": ${e}`); }
  const st = o.settings ?? {};
  return { version: 1, activities: acts, templates: o.templates, categories: o.categories.map(String), settings: { theme: st.theme === 'light' ? 'light' : 'dark', weekStart: [0, 1, 6].includes(st.weekStart) ? st.weekStart : 1 } };
}
const csvCell = (v: unknown) => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function toCSV(s: State): string {
  const rows = [['date', 'title', 'category', 'priority', 'status', 'start', 'end', 'background', 'repeat', 'repeat_until', 'notes']];
  for (const a of s.activities) rows.push([a.date, a.title, a.category, a.priority, a.rule ? 'series' : a.status, a.start ?? '', a.end ?? '', a.background ? 'yes' : '', a.rule?.type ?? '', a.rule?.until ?? '', a.notes]);
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
export function toICS(s: State): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), names = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daily Planner//EN'];
  for (const a of s.activities) {
    const d = a.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${a.id}@dailyplanner.local`, `DTSTAMP:${stamp}`);
    if (a.start) lines.push(`DTSTART:${d}T${a.start.replace(':', '')}00`, `DTEND:${d}T${(a.end ?? a.start).replace(':', '')}00`);
    else lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(a.date, 1).replace(/-/g, '')}`);
    if (a.rule) {
      const u = a.rule.until ? `;UNTIL=${a.rule.until.replace(/-/g, '')}${a.start ? 'T235959' : ''}` : '';
      const by = a.rule.type === 'weekdays' ? `;BYDAY=${a.rule.days.map(x => names[x]).join(',')}` : '';
      lines.push(`RRULE:FREQ=${a.rule.type === 'daily' ? 'DAILY' : 'WEEKLY'}${by}${u}`);
    }
    lines.push(`SUMMARY:${esc(a.title)}`, `CATEGORIES:${esc(a.category)}`);
    if (a.notes) lines.push(`DESCRIPTION:${esc(a.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR'); return lines.join('\r\n');
}
