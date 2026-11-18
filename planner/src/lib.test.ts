import { describe, it, expect } from 'vitest';
import * as L from './lib';
const empty = (): L.State => ({ ...L.seed('2026-11-01'), activities: [], templates: [] });
const act = (p: Partial<L.Activity>): L.Activity => ({ id: L.uid(), title: 'T', notes: '', category: 'Personal', priority: 'normal', status: 'not_started', date: '2026-11-24', order: 0, overrides: {}, ...p });
const add = (s: L.State, ...a: L.Activity[]): L.State => ({ ...s, activities: [...s.activities, ...a] });

describe('planner logic', () => {
  it('keeps different plans for Nov 24 and Nov 25, 2026', () => {
    const s = add(empty(), act({ title: 'Plan A', date: '2026-11-24' }), act({ title: 'Plan B', date: '2026-11-25' }));
    expect(L.itemsForDate(s, '2026-11-24').map(a => a.title)).toEqual(['Plan A']);
    expect(L.itemsForDate(s, '2026-11-25').map(a => a.title)).toEqual(['Plan B']);
  });
  it('navigates dates and years reliably', () => {
    expect(L.addMonths('2026-11-24', 14)).toBe('2028-01-24');
    expect(L.addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(L.addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(L.addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(L.addMonths('2026-11-24', -12 * 3)).toBe('2023-11-24');
    expect(L.isDate('2026-02-30')).toBe(false);
    expect(L.monthGrid('2026-11-24', 1)[0]).toBe('2026-10-26');
    expect(L.monthGrid('2026-11-24', 0)[0]).toBe('2026-11-01');
  });
  it('expands recurring tasks once per date with independent completion', () => {
    const r = act({ title: 'Daily', date: '2026-11-20', rule: { type: 'daily', days: [] } });
    const s = add(empty(), r);
    expect(L.itemsForDate(s, '2026-11-24')).toHaveLength(1);
    expect(L.itemsForDate(s, '2026-11-19')).toHaveLength(0);
    const done = { ...r, overrides: { '2026-11-24': 'completed' as L.Status } };
    expect(L.statusOn(done, '2026-11-24')).toBe('completed');
    expect(L.statusOn(done, '2026-11-25')).toBe('not_started');
    const wd = act({ date: '2026-11-02', rule: { type: 'weekdays', days: [1, 3, 5] } });
    expect([ '2026-11-23','2026-11-24','2026-11-25','2026-11-27'].map(d => L.occursOn(wd, d))).toEqual([true, false, true, true]);
    const until = act({ date: '2026-11-02', rule: { type: 'weekly', days: [], until: '2026-11-16' } });
    expect([L.occursOn(until, '2026-11-09'), L.occursOn(until, '2026-11-23')]).toEqual([true, false]);
  });
  it('applies templates as independent copies', () => {
    let s = add(empty(), act({ title: 'Chore', date: '2026-11-24' }));
    s = L.templateFromDay(s, '2026-11-24', 'Tpl');
    const t = s.templates[0].id;
    s = L.applyTemplate(L.applyTemplate(s, t, '2026-11-24'), t, '2026-11-25');
    const copies = s.activities.filter(a => a.id && a.date !== undefined).slice(1);
    expect(new Set(s.activities.map(a => a.id)).size).toBe(3);
    s = { ...s, activities: s.activities.map(a => (a.id === copies[0].id ? { ...a, title: 'Edited', status: 'completed' } : a)) };
    expect(s.activities.filter(a => a.title === 'Edited')).toHaveLength(1);
    expect(s.templates[0].items[0].title).toBe('Chore');
    expect(L.itemsForDate(s, '2026-11-25')[0].status).toBe('not_started');
  });
  it('reorders flexible tasks', () => {
    const a = act({ title: 'A', order: 0 }), b = act({ title: 'B', order: 1 });
    const s = L.reorder(add(empty(), a, b), b.id, '2026-11-24', -1);
    expect(L.itemsForDate(s, '2026-11-24').map(x => x.title)).toEqual(['B', 'A']);
  });
  it('duplicates without sharing state', () => {
    const r = act({ rule: { type: 'weekdays', days: [1] }, overrides: { '2026-11-23': 'completed' } });
    const s = L.duplicate(add(empty(), r), r.id), c = s.activities[1];
    c.rule!.days.push(2);
    expect(r.rule!.days).toEqual([1]); expect(c.overrides).toEqual({});
  });
  it('does not complete tasks because time passed; background tasks never conflict', () => {
    const past = act({ date: '2000-01-01', start: '08:00', end: '09:00' });
    expect(L.statusOn(past, '2000-01-01')).toBe('not_started');
    const a = act({ start: '10:00', end: '11:00' }), b = act({ start: '10:30', end: '11:30' }), afk = act({ start: '10:00', end: '12:00', background: true });
    expect([...L.conflicts([a, b, afk])].length).toBe(2);
    expect(L.conflicts([a, afk]).size).toBe(0);
  });
  it('validates input', () => {
    expect(L.validateActivity(act({ title: '  ' }))).toMatch(/Title/);
    expect(L.validateActivity(act({ date: '2026-13-01' }))).toMatch(/Date/);
    expect(L.validateActivity(act({ start: '10:00', end: '09:00' }))).toMatch(/End time/);
    expect(L.validateActivity(act({ rule: { type: 'weekdays', days: [] } }))).toMatch(/weekday/);
    expect(L.validateActivity(act({}))).toBeNull();
  });
  it('round-trips backups and rejects bad files', () => {
    const s = L.seed('2026-11-24');
    expect(L.parseBackup(JSON.stringify(s))).toEqual(s);
    expect(() => L.parseBackup('nope')).toThrow(); expect(() => L.parseBackup('{"version":2}')).toThrow();
    expect(() => L.parseBackup(JSON.stringify({ ...s, activities: [{ ...s.activities[0], date: 'bad' }] }))).toThrow(/Invalid activity/);
  });
  it('exports CSV and ICS', () => {
    const s = add(empty(), act({ title: 'A, "quoted"', notes: 'x;y', start: '06:30', end: '07:15', rule: { type: 'weekdays', days: [1, 3] } }), act({ title: 'Flex' }));
    expect(L.toCSV(s)).toContain('"A, ""quoted"""');
    const ics = L.toICS(s);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE'); expect(ics).toContain('DTSTART:20261124T063000'); expect(ics).toContain('DTSTART;VALUE=DATE:20261124');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
