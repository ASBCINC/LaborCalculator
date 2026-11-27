// v11.11.0 test for scripts/feed_import.js: a synthetic D-Tools calendar feed -> build() -> the app's real importer
// (dtools-schedule.js asbcImportSchedule) running in Node against the stand-in Firebase. Run: node tests/feed_test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const F = require('../scripts/feed_import.js');
const day = n => { const x = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ymd = d => d.replace(/-/g, '');
// D-Tools writes timed entries as UTC from US Eastern wall time: 09:00-17:00 entered -> 14:00Z-22:00Z (winter)
const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//D-Tools, Inc.//D-Tools Cloud//EN',
  'BEGIN:VEVENT', 'UID:event-900-11110@cloud.d-tools.com', `DTSTART:${ymd(day(3))}T140000Z`, `DTEND:${ymd(day(3))}T220000Z`, 'SUMMARY:Project Event: Smith Residence',
  'DESCRIPTION:Project: Smith Residence\\nAssigned to: Joe Tech\\, Ann Lead\\nAddress: 1 Main St\\nSan Francisco\\, CA 94100\\nUnited States\\n\\nView in D-Tools Cloud: https://d-tools.cloud?x=1', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:event-901-11110@cloud.d-tools.com', `DTSTART;VALUE=DATE:${ymd(day(4))}`, `DTEND;VALUE=DATE:${ymd(day(5))}`, 'SUMMARY:Project Event: Smith Residence',
  'DESCRIPTION:Project: Smith Residence\\nAssigned to: Joe Tech\\nAddress: 1 Main St\\n\\nView in D-Tools Cloud: https://d-tools.cloud?x=2', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:meeting-77-11110@cloud.d-tools.com', `DTSTART;VALUE=DATE:${ymd(day(2))}`, `DTEND;VALUE=DATE:${ymd(day(3))}`, 'SUMMARY:Meeting: Warehouse Pickup',
  'DESCRIPTION:Address: 9 Dock Rd\\n\\nBring a dolly', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:task-5-11110@cloud.d-tools.com', `DTSTART;VALUE=DATE:${ymd(day(1))}`, 'SUMMARY:Task: Call client', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:event-1-11110@cloud.d-tools.com', `DTSTART;VALUE=DATE:${ymd(day(-30))}`, 'SUMMARY:Project Event: Old', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
const prev = { events: [{ id: 'ev900', date: day(3), start: '09:00', end: '17:00', name: 'Smith Residence', status: 'In Progress', pid: 501, number: 'SR-P-1', client: 'Smith', stage: 'In Progress', desc: 'Gate code 1234', people: [] },
  { id: 'mt77-' + day(2), kind: 'event', date: day(2), name: 'Warehouse Pickup', people: ['Joe Tech'] }], holidays: [{ date: day(20), name: 'Company day' }] };
const B = F.build(F.parseIcs(ICS), prev, {}, day(0));
assert.strictEqual(B.tzProblem, '');
assert.deepStrictEqual(B.stats, { events: 2, meetings: 1, tasks: 1, skipped: 1 });
const p = B.projects[0], t = p.tasks;
assert.strictEqual(p.name, 'Smith Residence'); assert.strictEqual(p.number, 'SR-P-1'); assert.strictEqual(p.pid, 501);
assert.strictEqual(t[0].start, day(3) + ' 09:00'); assert.strictEqual(t[0].end, day(3) + ' 17:00');
assert.strictEqual(t[0].status, 'In Progress'); assert.strictEqual(t[0].desc, 'Gate code 1234');
assert.deepStrictEqual(t[0].assignees, ['Joe Tech', 'Ann Lead']); assert.strictEqual(t[0].address, '1 Main St\nSan Francisco, CA 94100\nUnited States');
assert.strictEqual(t[1].start, day(4)); assert.strictEqual(t[1].status, '');
const m = B.extra.meetings[0]; assert.strictEqual(m.allDay, true); assert.deepStrictEqual(m.people, ['Joe Tech']); assert.strictEqual(m.location, '9 Dock Rd');
assert.strictEqual(B.extra.holidays.length, 1); assert.strictEqual(B.extra.via, 'feed');
// time-zone guard: every timed entry shifted by the same hours -> problem
const shifted = { events: [0, 1, 2].map(i => ({ id: 'ev' + (900 + i), date: day(3), start: '12:00', name: 'X' })) };
const many = F.parseIcs(ICS).concat(F.parseIcs(ICS.replace(/event-900/g, 'event-902')), F.parseIcs(ICS.replace(/event-900/g, 'event-903')));
shifted.events = ['ev900', 'ev902', 'ev903'].map(id => ({ id, date: day(3), start: '12:00', name: 'Smith Residence' }));
assert.ok(F.build(many, shifted, {}, day(0)).tzProblem, 'tz guard should trip');

// the real importer, in Node, with the stand-in Firebase and the service-account user
(async () => {
  global.window = global;
  window.__FIXTURE = { user: { email: 'svc@asbc-calculator.iam.gserviceaccount.com', isService: true }, docs: {
    'config/users': { users: { 'joe@asbc.us': { name: 'Joe Tech', access: 'installer', role: 'tech' }, 'ann@asbc.us': { name: 'Ann Lead', access: 'lead', role: 'tech' } } } },
    collections: { quotes: { q1: { status: 'won', label: 'Smith Residence', items: [{ id: 'x', qty: 1 }], project: { dtoolsProjectName: 'Smith Residence' } } } } };
  const sent = []; global.fetch = async (u, o) => { sent.push([u, JSON.parse(o.body)]); return { status: 200 }; };
  for (const f of ['tests/mock-firebase.js', 'roles.js', 'dtools-schedule.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  const res = await window.asbcImportSchedule(B.projects, B.extra);
  assert.deepStrictEqual(res.updated, ['Smith Residence']);
  const q = window.__FIXTURE.docs['quotes/q1'];
  assert.deepStrictEqual(q.schedule.dates, [day(3), day(4)]); assert.deepStrictEqual(q.schedule.techs.sort(), ['ann@asbc.us', 'joe@asbc.us']);
  assert.strictEqual(q.schedule.times[day(3)].start, '09:00'); assert.strictEqual(q.status, 'scheduled');
  assert.ok(sent.some(([u, b]) => /\/notify$/.test(u) && b.kind === 'schedule' && b.quote === 'q1'), 'techs messaged about the new install');
  const ev = window.__FIXTURE.docs['config/dtoolsEvents'];
  assert.strictEqual(ev.events.filter(e => e.kind === 'event').length, 1); assert.strictEqual(ev.holidays.length, 1);
  assert.strictEqual(window.__FIXTURE.docs['config/syncStatus'].via, 'feed');
  console.log('feed test ok');
})().catch(e => { console.error(e); process.exit(1); });
