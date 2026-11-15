export const CARE_TIME_ZONE = 'Asia/Kolkata';

export function today(timeZone = CARE_TIME_ZONE, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${part.year}-${part.month}-${part.day}`;
}

export function addCalendarDays(date, amount) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function localDateTime(date, time, timeZone = CARE_TIME_ZONE) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(localAsUtc));
  const part = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const representedAsUtc = Date.UTC(
    Number(part.year),
    Number(part.month) - 1,
    Number(part.day),
    Number(part.hour),
    Number(part.minute),
    Number(part.second),
  );
  return new Date(localAsUtc - (representedAsUtc - localAsUtc)).toISOString();
}

export function buildDoseSchedule(
  medicationId,
  time,
  frequency = 'Daily',
  now = new Date(),
  timeZone = CARE_TIME_ZONE,
) {
  const firstDay = new Date(`${today(timeZone, now)}T00:00:00.000Z`);
  return Array.from({ length: 14 }, (_, offset) => {
    if (frequency === 'Weekly' && offset % 7 !== 0) return null;
    const day = new Date(firstDay);
    day.setUTCDate(day.getUTCDate() + offset);
    const date = day.toISOString().slice(0, 10);
    return {
      medication_id: medicationId,
      due_at: localDateTime(date, time, timeZone),
      status: 'pending',
    };
  }).filter(Boolean);
}

export function formatDate(
  value,
  options = { day: 'numeric', month: 'short' },
  timeZone = CARE_TIME_ZONE,
) {
  if (!value) return '—';
  const isCalendarDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isCalendarDate ? value + 'T00:00:00.000Z' : value);
  return new Intl.DateTimeFormat('en-IN', {
    ...options,
    timeZone: isCalendarDate ? 'UTC' : timeZone,
  }).format(date);
}

export function formatTime(value, timeZone = CARE_TIME_ZONE) {
  return value
    ? new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      }).format(new Date(value))
    : '—';
}

export function safeError(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

export function isStrongPassword(value) {
  return (
    typeof value === 'string' &&
    value.length >= 12 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}
