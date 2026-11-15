import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDays,
  buildDoseSchedule,
  formatDate,
  formatTime,
  localDateTime,
  safeError,
  isStrongPassword,
  today,
} from '../src/utils.js';

test('today uses the care profile timezone rather than UTC', () => {
  const justAfterLocalMidnight = new Date('2026-11-14T20:00:00.000Z');
  assert.equal(today('Asia/Kolkata', justAfterLocalMidnight), '2026-11-15');
});

test('calendar-day arithmetic handles month and year boundaries', () => {
  assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addCalendarDays('2028-02-28', 1), '2028-02-29');
});

test('local medication time converts to the correct UTC instant', () => {
  assert.equal(localDateTime('2026-11-15', '08:00', 'Asia/Kolkata'), '2026-11-15T02:30:00.000Z');
});

test('daily schedule creates exactly fourteen consecutive local dates', () => {
  const rows = buildDoseSchedule('med-1', '08:00', 'Daily', new Date('2026-11-14T20:00:00.000Z'));
  assert.equal(rows.length, 14);
  assert.equal(rows[0].due_at, '2026-11-15T02:30:00.000Z');
  assert.equal(rows[13].due_at, '2026-11-28T02:30:00.000Z');
  assert.ok(rows.every((row) => row.medication_id === 'med-1' && row.status === 'pending'));
});

test('weekly schedule creates two doses in a fourteen-day window', () => {
  const rows = buildDoseSchedule('med-2', '21:15', 'Weekly', new Date('2026-11-14T20:00:00.000Z'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].due_at, '2026-11-15T15:45:00.000Z');
  assert.equal(rows[1].due_at, '2026-11-22T15:45:00.000Z');
});

test('formatters handle empty values safely', () => {
  assert.equal(formatDate(null), '—');
  assert.equal(formatTime(undefined), '—');
  assert.equal(safeError({ message: 'Request failed' }), 'Request failed');
  assert.equal(safeError(null), 'Something went wrong. Please try again.');
});

test('password policy requires length and character diversity', () => {
  assert.equal(isStrongPassword('GoodPass123!'), true);
  assert.equal(isStrongPassword('short'), false);
  assert.equal(isStrongPassword('lowercaseonly123!'), false);
});
