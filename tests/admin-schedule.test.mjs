import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: [new URL('../lib/admin-schedule.ts', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1')], bundle: true, write: false, platform: 'node', format: 'esm' });
const { adjacentMonth, initialScheduleDate, scheduleSlotState, pageItems } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));

test('calendar navigation crosses years, validates months and picks an in-month date', () => {
  assert.equal(adjacentMonth('2026-12', 1), '2027-01');
  assert.equal(adjacentMonth('2027-01', -1), '2026-12');
  assert.throws(() => adjacentMonth('2027-13', 1));
  assert.equal(initialScheduleDate('2027-01', '2027-01-12'), '2027-01-12');
  assert.equal(initialScheduleDate('2027-01', '2026-11-19'), '2027-01-01');
});
test('calendar distinguishes confirmed, FLOW/manual closure, pending, available and past slots', () => {
  const slot = { status: 'OPEN', calendarBlocked: false, hasConfirmed: 0, requestCount: 0, endAt: '2027-01-04T11:30:00+09:00' };
  const now = new Date('2026-11-19T09:00:00+09:00').getTime();
  assert.equal(scheduleSlotState(slot, now).label, '예약 가능');
  assert.equal(scheduleSlotState({ ...slot, requestCount: 2 }, now).label, '승인 대기 2');
  assert.equal(scheduleSlotState({ ...slot, status: 'BLOCKED' }, now).label, '마감');
  assert.equal(scheduleSlotState({ ...slot, calendarBlocked: true }, now).label, '마감');
  assert.equal(scheduleSlotState({ ...slot, status: 'BLOCKED', hasConfirmed: 1 }, now).label, '예약 확정');
  assert.equal(scheduleSlotState(slot, new Date('2027-01-05').getTime()).code, 'past');
});
test('day/course lists are bounded even after deletion or an out-of-range page', () => {
  const items = Array.from({ length: 21 }, (_, i) => i);
  assert.equal(pageItems(items, 0).items.length, 8);
  assert.deepEqual(pageItems(items, 100).items, [16,17,18,19,20]);
  assert.equal(pageItems(items, -1).page, 0);
  assert.deepEqual(pageItems([], 3), { page: 0, pages: 1, items: [] });
  assert.equal(pageItems(items, 0, 4).items.length, 4);
});
test('unified workspace uses date selection, private details, native editors and no infinite month feed', async () => {
  const root = new URL('../', import.meta.url);
  const [workspace, admin, app, css] = await Promise.all(['app/components/AdminSchedule.tsx','app/components/BookingAdmin.tsx','app/components/EduSystemApp.tsx','app/interface.css'].map(path => readFile(new URL(path, root), 'utf8')));
  assert.match(workspace, /aria-label="선택 날짜 일정"/);
  assert.match(workspace, /renderOpenings\(dialog.id, setOpeningBusy\)/);
  assert.match(workspace, /AccessibleDialog/);
  assert.match(workspace, /cache: "no-store"/);
  assert.match(workspace, /cancelCourses\(\); cancelFlow\(\)/);
  assert.match(workspace, /pageItems\(daySlots, page\)/);
  assert.match(workspace, /ArrowDown: 7/);
  assert.doesNotMatch(admin, /groups\.map\(\(\[date, slots\]\)/);
  assert.doesNotMatch(app, /<CalendarSyncPanel/);
  assert.match(app, /compact initialCourse=\{id\}/);
  assert.match(css, /\.learning-public \.portal-guest-action > a/);
  assert.match(css, /background: #1d1d1f; color: #fff/);
});
