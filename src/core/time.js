// Time-zone helpers. Forge's Node runtime ships full ICU, so Intl handles any
// IANA zone without a library.

export function toMs(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

const dateFmtCache = new Map();
function dateFmt(timeZone) {
  if (!dateFmtCache.has(timeZone)) {
    dateFmtCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }));
  }
  return dateFmtCache.get(timeZone);
}

// "YYYY-MM-DD" of an instant as seen in `timeZone`.
export function localDate(value, timeZone) {
  const ms = toMs(value);
  if (!ms) return '';
  return dateFmt(timeZone).format(new Date(ms));
}

// Offset of `timeZone` from UTC, in ms, at instant `ms`.
function offsetAt(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// UTC ms of local midnight starting `dateStr` ("YYYY-MM-DD") in `timeZone`.
export function localMidnightMs(dateStr, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let ms = guess - offsetAt(guess, timeZone);
  // Second pass settles DST transitions that fall near midnight.
  ms = guess - offsetAt(ms, timeZone);
  return ms;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Monday on or before `dateStr`.
export function mondayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

// Mon 00:00 -> Sun 23:59:59.999 local, as UTC ms bounds.
export function weekWindow(weekStart, timeZone) {
  const monday = mondayOf(weekStart);
  return {
    weekStart: monday,
    weekEnd: addDays(monday, 6),
    startMs: localMidnightMs(monday, timeZone),
    endMs: localMidnightMs(addDays(monday, 7), timeZone) - 1,
  };
}

// The last full week before `nowMs`.
export function previousWeekStart(nowMs, timeZone) {
  return addDays(mondayOf(localDate(nowMs, timeZone)), -7);
}

// End of a Jira due date ("YYYY-MM-DD") in the team's zone: due means "by the
// end of that day", not its first millisecond.
export function dueEndMs(due, timeZone) {
  if (!due) return 0;
  return localMidnightMs(addDays(due.slice(0, 10), 1), timeZone) - 1;
}
