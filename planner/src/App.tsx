import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from './lib';
import { load, save } from './storage';
import { notify } from './notify';
import './style.css';

type View = 'dashboard' | 'calendar' | 'activities' | 'templates' | 'history' | 'settings';
type Cal = 'month' | 'week' | 'day' | 'agenda';
const SL: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', skipped: 'Skipped' };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NAV: [View, string, string][] = [['dashboard', '🏠', 'Dashboard'], ['calendar', '📅', 'Calendar'], ['activities', '✅', 'Activities'], ['templates', '📋', 'Templates'], ['history', '🕘', 'History'], ['settings', '⚙️', 'Settings']];

interface Act {
  toggle(a: L.Activity, d: string): void; status(a: L.Activity, d: string, s: L.Status): void; edit(a: L.Activity): void;
  dup(a: L.Activity): void; del(a: L.Activity): void; move(a: L.Activity, d: string, dir: -1 | 1): void;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [st, setSt] = useState<L.State | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [cal, setCal] = useState<Cal>('month');
  const [cur, setCur] = useState(L.today());
  const [edit, setEdit] = useState<Partial<L.Activity> | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; ok: () => void } | null>(null);
  const [toast, setToast] = useState('');
  const [fatal, setFatal] = useState('');
  const loaded = useRef(false);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { load().then(s => { setSt(s ?? L.seed(L.today())); loaded.current = true; }).catch(e => setFatal(String(e.message ?? e))); }, []);
  useEffect(() => { if (st && loaded.current) save(st).catch(e => flash('Save failed: ' + (e.message ?? e))); }, [st]);
  useEffect(() => { document.documentElement.dataset.theme = st?.settings.theme ?? 'dark'; }, [st?.settings.theme]);

  const stRef = useRef(st); stRef.current = st;
  useEffect(() => { // reminder checker: runs while the app is alive (including hidden in the tray)
    let fired = new Set<string>();
    try { fired = new Set<string>(JSON.parse(localStorage.getItem('planner.fired') || '[]')); } catch { /* ignore */ }
    const tick = () => {
      const s = stRef.current; if (!s || !loaded.current) return;
      const now = new Date(), t = L.fmt(now);
      for (const k of [...fired]) if (!k.endsWith('|' + t)) fired.delete(k);
      for (const d of L.dueReminders(s, now, fired)) { fired.add(d.key); notify('⏰ ' + d.title, d.body); flash('⏰ ' + d.title + ' — ' + d.body); }
      try { localStorage.setItem('planner.fired', JSON.stringify([...fired])); } catch { /* ignore */ }
    };
    tick(); const id = setInterval(tick, 15000); return () => clearInterval(id);
  }, []);

  if (fatal) return <div className="center"><h2>Could not load your data</h2><p>{fatal}</p><p>Nothing was overwritten. See the README troubleshooting section.</p></div>;
  if (!st) return <div className="center">Loading…</div>;
  const ws = st.settings.weekStart;
  const mut = (f: (s: L.State) => L.State) => setSt(s => (s ? f(s) : s));
  const upsert = (a: L.Activity) => mut(s => s.activities.some(x => x.id === a.id) ? { ...s, activities: s.activities.map(x => (x.id === a.id ? a : x)) } : { ...s, activities: [...s.activities, { ...a, order: L.nextOrder(s) }] });
  const setStatus = (a: L.Activity, d: string, status: L.Status) => upsert(a.rule ? { ...a, overrides: { ...a.overrides, [d]: status } } : { ...a, status });
  const act: Act = {
    toggle: (a, d) => setStatus(a, d, L.statusOn(a, d) === 'completed' ? 'not_started' : 'completed'),
    status: setStatus, edit: a => setEdit(a), dup: a => { mut(s => L.duplicate(s, a.id)); flash('Duplicated'); },
    del: a => setConfirm({ msg: a.rule ? `Delete the whole repeating series "${a.title}" (all dates)?` : `Delete "${a.title}"?`, ok: () => { mut(s => ({ ...s, activities: s.activities.filter(x => x.id !== a.id) })); flash('Deleted'); } }),
    move: (a, d, dir) => mut(s => L.reorder(s, a.id, d, dir)),
  };
  const open = (d: string) => { setCur(d); setView('calendar'); setCal('day'); };
  const newAct = (d: string) => setEdit({ date: d });

  return (
    <div className="app">
      <nav className="side" aria-label="Main">
        <div className="brand">🗓 Planner</div>
        {NAV.map(([v, e, t]) => <button key={v} className={view === v ? 'nav on' : 'nav'} aria-current={view === v} onClick={() => setView(v)}><span className="ic" aria-hidden="true">{e}</span><span className="lb">{t}</span></button>)}
      </nav>
      <main className="main">
        {view === 'dashboard' && <Dashboard st={st} act={act} open={open} onNew={() => newAct(L.today())} />}
        {view === 'calendar' && <Calendar st={st} act={act} cal={cal} setCal={setCal} cur={cur} setCur={setCur} open={open} onNew={() => newAct(cur)} />}
        {view === 'activities' && <Activities st={st} act={act} onNew={() => newAct(cur)} />}
        {view === 'templates' && <Templates st={st} cur={cur} mut={mut} flash={flash} setConfirm={setConfirm} />}
        {view === 'history' && <History st={st} act={act} />}
        {view === 'settings' && <SettingsView st={st} mut={mut} flash={flash} setConfirm={setConfirm} />}
      </main>
      {edit && <Editor init={edit} cats={st.categories} onClose={() => setEdit(null)} onSave={a => { upsert(a); setEdit(null); flash('Saved'); }} />}
      {confirm && <div className="modal" role="alertdialog" aria-modal="true"><div className="card dlg"><p>{confirm.msg}</p><div className="row-btns"><button onClick={() => setConfirm(null)}>Cancel</button><button className="danger" autoFocus onClick={() => { confirm.ok(); setConfirm(null); }}>Confirm</button></div></div></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Row({ a, d, act, first, last, clash, noOrder }: { a: L.Activity; d: string; act: Act; first?: boolean; last?: boolean; clash?: boolean; noOrder?: boolean }) {
  const s = L.statusOn(a, d);
  return (
    <li className={'item' + (s === 'completed' ? ' done' : '') + (s === 'skipped' ? ' skip' : '')}>
      <input type="checkbox" aria-label={`Complete ${a.title}`} checked={s === 'completed'} onChange={() => act.toggle(a, d)} />
      <div className="grow">
        <b>{a.title}</b>
        <div className="meta">
          {a.start && <span>🕒 {a.start}–{a.end}</span>}<span className="tag">{a.category}</span><span className={'pri ' + a.priority}>{a.priority}</span>
          {a.rule && <span title="Repeats">↻ {a.rule.type}</span>}{a.background && <span>background</span>}{clash && <span className="warn">⚠ overlaps</span>}
        </div>
        {a.notes && <div className="notes">{a.notes}</div>}
      </div>
      <div className="ctl">
      <select aria-label="Status" value={s} onChange={e => act.status(a, d, e.target.value as L.Status)}>{L.STATUSES.map(x => <option key={x} value={x}>{SL[x]}</option>)}</select>
      {!noOrder && !a.start && <><button aria-label="Move up" disabled={first} onClick={() => act.move(a, d, -1)}>↑</button><button aria-label="Move down" disabled={last} onClick={() => act.move(a, d, 1)}>↓</button></>}
      <button aria-label="Edit" onClick={() => act.edit(a)}>✏️</button><button aria-label="Duplicate" onClick={() => act.dup(a)}>⧉</button><button aria-label="Delete" onClick={() => act.del(a)}>🗑</button>
    </div>
    </li>
  );
}

function DayList({ d, items, act, noOrder }: { d: string; items: L.Activity[]; act: Act; noOrder?: boolean }) {
  const timed = items.filter(a => a.start).sort((a, b) => a.start!.localeCompare(b.start!)), flex = items.filter(a => !a.start), clash = L.conflicts(items);
  return <>
    <h4>Time-blocked</h4>
    {timed.length ? <ul className="list">{timed.map(a => <Row key={a.id} a={a} d={d} act={act} clash={clash.has(a.id)} noOrder={noOrder} />)}</ul> : <p className="empty">Nothing time-blocked.</p>}
    <h4>Anytime / Flexible Tasks</h4>
    {flex.length ? <ul className="list">{flex.map((a, i) => <Row key={a.id} a={a} d={d} act={act} first={i === 0} last={i === flex.length - 1} noOrder={noOrder} />)}</ul> : <p className="empty">No flexible tasks. Add one to get started.</p>}
  </>;
}

function Month({ cur, st, onPick, mini }: { cur: string; st: L.State; onPick: (d: string) => void; mini?: boolean }) {
  const ws = st.settings.weekStart, t = L.today();
  return <div className={'month' + (mini ? ' mini' : '')} role="grid">
    {Array.from({ length: 7 }, (_, i) => <div key={i} className="wd">{WD[(ws + i) % 7]}</div>)}
    {L.monthGrid(cur, ws).map(d => {
      const it = L.itemsForDate(st, d);
      return <button key={d} className={'cell' + (d.slice(0, 7) !== cur.slice(0, 7) ? ' other' : '') + (d === t ? ' today' : '') + (d === cur ? ' sel' : '')} aria-label={L.label(d) + `, ${it.length} activities`} onClick={() => onPick(d)}>
        <span className="n">{Number(d.slice(8))}</span>
        {mini ? (it.length > 0 && <span className="dot" />) : it.slice(0, 3).map(a => <span key={a.id} className="chip">{a.title}</span>)}
        {!mini && it.length > 0 && <span className="dot only-m" />}
        {!mini && it.length > 3 && <span className="more">+{it.length - 3} more</span>}
      </button>;
    })}
  </div>;
}

function Dashboard({ st, act, open, onNew }: { st: L.State; act: Act; open: (d: string) => void; onNew: () => void }) {
  const t = L.today(), items = L.itemsForDate(st, t);
  const done = items.filter(a => L.statusOn(a, t) === 'completed').length, rem = items.filter(a => !['completed', 'skipped'].includes(L.statusOn(a, t))).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const upcoming = Array.from({ length: 7 }, (_, i) => L.addDays(t, i + 1)).flatMap(d => L.itemsForDate(st, d).map(a => ({ a, d }))).slice(0, 8);
  return <>
    <header className="top"><div><h1>{L.parse(t).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h1><p className="sub">{done} done · {rem} remaining</p></div><button className="primary" onClick={onNew}>＋ New activity</button></header>
    <div className="card"><div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pct + '%' }} /></div><p className="sub">{pct}% of today's plan completed</p></div>
    <div className="grid2">
      <div className="card"><h3>Today</h3><DayList d={t} items={items} act={act} /></div>
      <div>
        <div className="card"><h3>Upcoming</h3>{upcoming.length ? <ul className="plain">{upcoming.map(({ a, d }) => <li key={a.id + d}><button className="link" onClick={() => open(d)}>{L.label(d)}</button> — {a.title}{a.start ? ` (${a.start})` : ''}</li>)}</ul> : <p className="empty">Nothing planned for the next 7 days.</p>}</div>
        <div className="card"><h3>Calendar</h3><Month cur={t} st={st} onPick={open} mini /></div>
      </div>
    </div>
  </>;
}

function Calendar({ st, act, cal, setCal, cur, setCur, open, onNew }: { st: L.State; act: Act; cal: Cal; setCal: (c: Cal) => void; cur: string; setCur: (d: string) => void; open: (d: string) => void; onNew: () => void }) {
  const ws = st.settings.weekStart;
  const step = (n: number) => setCur(cal === 'month' ? L.addMonths(cur, n) : cal === 'day' ? L.addDays(cur, n) : L.addDays(cur, 7 * n));
  const wk = L.weekStart(cur, ws);
  const title = cal === 'month' ? L.parse(cur).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : cal === 'week' ? `${L.label(wk)} – ${L.label(L.addDays(wk, 6))}` : cal === 'day' ? L.label(cur) : `Agenda from ${L.label(cur)}`;
  const agenda = useMemo(() => Array.from({ length: 60 }, (_, i) => L.addDays(cur, i)).map(d => ({ d, it: L.itemsForDate(st, d) })).filter(x => x.it.length), [st, cur]);
  return <>
    <header className="top"><h1>{title}</h1><button className="primary" onClick={onNew}>＋ New activity</button></header>
    <div className="toolbar">
      <button aria-label="Previous year" onClick={() => setCur(L.addMonths(cur, -12))}>«</button><button aria-label="Previous" onClick={() => step(-1)}>‹</button>
      <button onClick={() => setCur(L.today())}>Today</button>
      <button aria-label="Next" onClick={() => step(1)}>›</button><button aria-label="Next year" onClick={() => setCur(L.addMonths(cur, 12))}>»</button>
      <input type="date" aria-label="Jump to date" value={cur} onChange={e => L.isDate(e.target.value) && setCur(e.target.value)} />
      <span className="seg">{(['month', 'week', 'day', 'agenda'] as Cal[]).map(c => <button key={c} className={cal === c ? 'on' : ''} onClick={() => setCal(c)}>{c[0].toUpperCase() + c.slice(1)}</button>)}</span>
    </div>
    {cal === 'month' && <div className="card"><Month cur={cur} st={st} onPick={open} /></div>}
    {cal === 'week' && <div className="week">{Array.from({ length: 7 }, (_, i) => L.addDays(wk, i)).map(d => <div key={d} className={'card' + (d === L.today() ? ' today' : '')}><button className="link" onClick={() => open(d)}><b>{L.label(d)}</b></button>{L.itemsForDate(st, d).map(a => <div key={a.id} className="mini-i">{L.statusOn(a, d) === 'completed' ? '✓ ' : ''}{a.start ? a.start + ' ' : ''}{a.title}</div>)}</div>)}</div>}
    {cal === 'day' && <div className="card"><DayList d={cur} items={L.itemsForDate(st, cur)} act={act} /></div>}
    {cal === 'agenda' && (agenda.length ? agenda.map(({ d, it }) => <div key={d} className="card"><h3>{L.label(d)}</h3><DayList d={d} items={it} act={act} noOrder /></div>) : <p className="empty card">Nothing planned in the next 60 days.</p>)}
  </>;
}

function Activities({ st, act, onNew }: { st: L.State; act: Act; onNew: () => void }) {
  const [f, setF] = useState({ q: '', cat: '', pri: '', stat: '', date: '' });
  const rows = (f.date ? L.itemsForDate(st, f.date).map(a => ({ a, d: f.date })) : [...st.activities].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order).map(a => ({ a, d: a.date })))
    .filter(({ a, d }) => (!f.q || (a.title + ' ' + a.notes).toLowerCase().includes(f.q.toLowerCase())) && (!f.cat || a.category === f.cat) && (!f.pri || a.priority === f.pri) && (!f.stat || L.statusOn(a, d) === f.stat));
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));
  return <>
    <header className="top"><h1>Activities</h1><button className="primary" onClick={onNew}>＋ New activity</button></header>
    <div className="toolbar">
      <input type="search" placeholder="Search name or notes…" aria-label="Search" value={f.q} onChange={e => set('q', e.target.value)} />
      <select aria-label="Category" value={f.cat} onChange={e => set('cat', e.target.value)}><option value="">All categories</option>{st.categories.map(c => <option key={c}>{c}</option>)}</select>
      <select aria-label="Priority" value={f.pri} onChange={e => set('pri', e.target.value)}><option value="">All priorities</option>{L.PRIORITIES.map(c => <option key={c}>{c}</option>)}</select>
      <select aria-label="Status filter" value={f.stat} onChange={e => set('stat', e.target.value)}><option value="">All statuses</option>{L.STATUSES.map(c => <option key={c} value={c}>{SL[c]}</option>)}</select>
      <input type="date" aria-label="Filter by date" value={f.date} onChange={e => set('date', e.target.value)} />
      <button onClick={() => setF({ q: '', cat: '', pri: '', stat: '', date: '' })}>Clear</button>
    </div>
    <p className="sub">{f.date ? `Showing ${L.label(f.date)}` : 'Showing every activity on its first date'} · {rows.length} found</p>
    {rows.length ? <ul className="list card">{rows.map(({ a, d }) => <li key={a.id + d} className="wrap"><small className="sub">{L.label(d)}</small><ul className="list"><Row a={a} d={d} act={act} noOrder /></ul></li>)}</ul> : <p className="empty card">No activities match.</p>}
  </>;
}

function Templates({ st, cur, mut, flash, setConfirm }: { st: L.State; cur: string; mut: (f: (s: L.State) => L.State) => void; flash: (m: string) => void; setConfirm: (c: any) => void }) {
  const [name, setName] = useState(''), [from, setFrom] = useState(cur), [to, setTo] = useState(cur);
  return <>
    <header className="top"><h1>Templates</h1></header>
    <div className="card"><h3>Save a day as a template</h3><div className="toolbar"><input placeholder="Template name" aria-label="Template name" value={name} onChange={e => setName(e.target.value)} /><input type="date" aria-label="Source date" value={from} onChange={e => setFrom(e.target.value)} />
      <button className="primary" onClick={() => { if (!name.trim() || !L.isDate(from)) return flash('Enter a name and a valid date'); if (!L.itemsForDate(st, from).length) return flash('That day has no activities'); mut(s => L.templateFromDay(s, from, name.trim())); setName(''); flash('Template saved'); }}>Save template</button></div></div>
    <div className="card"><label>Apply templates to date <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    {st.templates.length ? st.templates.map(t => <div key={t.id} className="card"><h3>{t.name}</h3><ul className="plain">{t.items.map((i, k) => <li key={k}>{i.start ? i.start + ' ' : ''}{i.title} <span className="tag">{i.category}</span></li>)}</ul>
      <div className="row-btns"><button className="primary" onClick={() => { if (!L.isDate(to)) return flash('Pick a valid date'); mut(s => L.applyTemplate(s, t.id, to)); flash(`Applied to ${L.label(to)}`); }}>Apply to {L.label(to)}</button>
        <button className="danger" onClick={() => setConfirm({ msg: `Delete template "${t.name}"? Activities already created from it stay.`, ok: () => mut(s => ({ ...s, templates: s.templates.filter(x => x.id !== t.id) })) })}>Delete</button></div></div>) : <p className="empty card">No templates yet. Save a day above to create one.</p>}
  </>;
}

function History({ st, act }: { st: L.State; act: Act }) {
  const t = L.today(), map = new Map<string, L.Activity[]>();
  for (const a of st.activities) {
    const ds = a.rule ? Object.keys(a.overrides).filter(d => a.overrides[d] === 'completed') : a.status === 'completed' ? [a.date] : [];
    for (const d of ds) if (d < t) map.set(d, [...(map.get(d) ?? []), a]);
  }
  const days = [...map.keys()].sort().reverse();
  return <>
    <header className="top"><h1>History</h1></header>
    {days.length ? days.map(d => <div key={d} className="card"><h3>{L.label(d)}</h3><ul className="list">{map.get(d)!.map(a => <Row key={a.id} a={a} d={d} act={act} noOrder />)}</ul></div>) : <p className="empty card">Completed activities from previous days will appear here.</p>}
  </>;
}

function SettingsView({ st, mut, flash, setConfirm }: { st: L.State; mut: (f: (s: L.State) => L.State) => void; flash: (m: string) => void; setConfirm: (c: any) => void }) {
  const [cat, setCat] = useState('');
  const stamp = L.today();
  const restore = async (file?: File) => {
    if (!file) return;
    try { const s = L.parseBackup(await file.text()); setConfirm({ msg: `Replace ALL current data with this backup (${s.activities.length} activities)?`, ok: () => { mut(() => s); flash('Backup restored'); } }); }
    catch (e: any) { flash('Restore failed: ' + e.message); }
  };
  const addCat = () => { const c = cat.trim(); if (!c) return; if (st.categories.some(x => x.toLowerCase() === c.toLowerCase())) return flash('Category already exists'); mut(s => ({ ...s, categories: [...s.categories, c] })); setCat(''); };
  return <>
    <header className="top"><h1>Settings</h1></header>
    <div className="card"><h3>Appearance</h3><div className="toolbar">
      <label>Theme <select value={st.settings.theme} onChange={e => mut(s => ({ ...s, settings: { ...s.settings, theme: e.target.value as 'dark' | 'light' } }))}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label>First day of week <select value={st.settings.weekStart} onChange={e => mut(s => ({ ...s, settings: { ...s.settings, weekStart: Number(e.target.value) as 0 | 1 | 6 } }))}><option value={0}>Sunday</option><option value={1}>Monday</option><option value={6}>Saturday</option></select></label></div></div>
    <div className="card"><h3>Reminders</h3><div className="toolbar">
      <label className="chk"><input type="checkbox" checked={st.settings.remind !== false} onChange={e => mut(s => ({ ...s, settings: { ...s.settings, remind: e.target.checked } }))} /> Notify me for time-blocked activities</label>
      <label>Notify <select value={st.settings.lead ?? 0} onChange={e => mut(s => ({ ...s, settings: { ...s.settings, lead: Number(e.target.value) } }))}><option value={0}>At start time</option><option value={5}>5 minutes before</option><option value={10}>10 minutes before</option><option value={15}>15 minutes before</option><option value={30}>30 minutes before</option></select></label>
      <button onClick={async () => flash((await notify('Daily Planner', 'Test notification: reminders are working.')) ? 'Notification sent' : 'Notifications are blocked. Allow them in Windows Settings.')}>Send test notification</button></div>
      <p className="sub">Reminders fire only while the app is running (closing the window keeps it in the system tray). Anytime/flexible tasks have no time, so they never trigger reminders.</p></div>
    <div className="card"><h3>Categories</h3><div className="chips">{st.categories.map(c => <span key={c} className="tag">{c} <button aria-label={`Remove ${c}`} className="x" onClick={() => setConfirm({ msg: `Remove category "${c}"? Existing activities keep their label.`, ok: () => mut(s => ({ ...s, categories: s.categories.filter(x => x !== c) })) })}>×</button></span>)}</div>
      <div className="toolbar"><input placeholder="New category" aria-label="New category" value={cat} onChange={e => setCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} /><button onClick={addCat}>Add</button></div></div>
    <div className="card"><h3>Backup &amp; export</h3><div className="toolbar">
      <button className="primary" onClick={() => download(`planner-backup-${stamp}.json`, JSON.stringify(st, null, 2), 'application/json')}>Download JSON backup</button>
      <label className="btn">Restore from backup…<input type="file" accept=".json,application/json" hidden onChange={e => { restore(e.target.files?.[0]); e.target.value = ''; }} /></label>
      <button onClick={() => download(`planner-${stamp}.csv`, L.toCSV(st), 'text/csv')}>Export CSV</button>
      <button onClick={() => download(`planner-${stamp}.ics`, L.toICS(st), 'text/calendar')}>Export ICS</button></div>
      <p className="sub">Data is saved automatically on this PC. Make a JSON backup before moving computers.</p></div>
  </>;
}

interface F { title: string; notes: string; category: string; priority: string; status: string; date: string; timed: boolean; start: string; end: string; background: boolean; repeat: string; days: number[]; until: string; remind: boolean }
function Editor({ init, cats, onSave, onClose }: { init: Partial<L.Activity>; cats: string[]; onSave: (a: L.Activity) => void; onClose: () => void }) {
  const r = init.rule;
  const [f, setF] = useState<F>({ title: init.title ?? '', notes: init.notes ?? '', category: init.category ?? cats[0] ?? 'Personal', priority: init.priority ?? 'normal', status: init.status ?? 'not_started', date: init.date ?? L.today(), timed: !!init.start, start: init.start ?? '09:00', end: init.end ?? '10:00', background: !!init.background, repeat: r?.type ?? 'none', days: r?.days?.length ? r.days : [1, 2, 3, 4, 5], until: r?.until ?? '', remind: init.remind !== false });
  const [err, setErr] = useState('');
  const set = (k: keyof F, v: any) => setF(p => ({ ...p, [k]: v }));
  const catList = cats.includes(f.category) ? cats : [...cats, f.category];
  const submit = () => {
    const rule: L.Rule | undefined = f.repeat === 'none' ? undefined : { type: f.repeat as L.Rule['type'], days: f.repeat === 'weekdays' ? [...f.days].sort() : [], ...(f.until ? { until: f.until } : {}) };
    const a: L.Activity = { id: init.id ?? L.uid(), title: f.title.trim(), notes: f.notes, category: f.category, priority: f.priority as L.Priority, status: rule ? 'not_started' : (f.status as L.Status), date: f.date, start: f.timed ? f.start : undefined, end: f.timed ? f.end : undefined, background: f.background || undefined, remind: f.timed && !f.remind ? false : undefined, order: init.order ?? 0, overrides: init.overrides ?? {}, rule };
    const e = L.validateActivity(a); if (e) return setErr(e); onSave(a);
  };
  return <div className="modal" role="dialog" aria-modal="true" aria-label="Activity editor" onKeyDown={e => e.key === 'Escape' && onClose()}>
    <div className="card dlg wide">
      <h3>{init.id ? 'Edit activity' : 'New activity'}</h3>
      <label>Title<input autoFocus maxLength={120} value={f.title} onChange={e => set('title', e.target.value)} /></label>
      <label>Notes<textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} /></label>
      <div className="two"><label>Category<select value={f.category} onChange={e => set('category', e.target.value)}>{catList.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Priority<select value={f.priority} onChange={e => set('priority', e.target.value)}>{L.PRIORITIES.map(c => <option key={c}>{c}</option>)}</select></label></div>
      <div className="two"><label>{f.repeat === 'none' ? 'Date' : 'Starts on'}<input type="date" value={f.date} onChange={e => set('date', e.target.value)} /></label>
        {f.repeat === 'none' && <label>Status<select value={f.status} onChange={e => set('status', e.target.value)}>{L.STATUSES.map(c => <option key={c} value={c}>{SL[c]}</option>)}</select></label>}</div>
      <label className="chk"><input type="checkbox" checked={f.timed} onChange={e => set('timed', e.target.checked)} /> Time-block this activity (otherwise it goes under Anytime / Flexible)</label>
      {f.timed && <label className="chk"><input type="checkbox" checked={f.remind} onChange={e => set('remind', e.target.checked)} /> Remind me with a notification</label>}
      {f.timed && <div className="two"><label>Start<input type="time" value={f.start} onChange={e => set('start', e.target.value)} /></label><label>End<input type="time" value={f.end} onChange={e => set('end', e.target.value)} /></label></div>}
      <label className="chk"><input type="checkbox" checked={f.background} onChange={e => set('background', e.target.checked)} /> Background task (AFK) — never counts as a scheduling conflict</label>
      <div className="two"><label>Repeat<select value={f.repeat} onChange={e => set('repeat', e.target.value)}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="weekdays">Selected weekdays</option></select></label>
        {f.repeat !== 'none' && <label>Repeat until (optional)<input type="date" value={f.until} onChange={e => set('until', e.target.value)} /></label>}</div>
      {f.repeat === 'weekdays' && <div className="chips">{WD.map((w, i) => <label key={w} className="chk"><input type="checkbox" checked={f.days.includes(i)} onChange={e => set('days', e.target.checked ? [...f.days, i] : f.days.filter(x => x !== i))} />{w}</label>)}</div>}
      {init.id && f.repeat !== 'none' && <p className="sub">Edits apply to every date in this series.</p>}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row-btns"><button onClick={onClose}>Cancel</button><button className="primary" onClick={submit}>Save</button></div>
    </div>
  </div>;
}
