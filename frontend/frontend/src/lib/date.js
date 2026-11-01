/**
 * Timezone-safe Date Utilities for MeetSync
 * Ensures meetings are grouped and compared by the user's local date,
 * avoiding off-by-one errors across UTC/local day boundaries.
 */

/**
 * Returns a 'YYYY-MM-DD' key corresponding to the date in the local timezone.
 * @param {string|Date|number} dateInput - ISO string, Date object, or timestamp
 * @returns {string} e.g. "2026-10-22"
 */
export function toLocalDateKey(dateInput) {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks whether two dates correspond to the same local calendar day.
 */
export function isSameLocalDay(d1, d2) {
  if (!d1 || !d2) return false;
  return toLocalDateKey(d1) === toLocalDateKey(d2);
}

/**
 * Checks whether a given date is "today" in local time.
 */
export function isToday(dateInput) {
  if (!dateInput) return false;
  return isSameLocalDay(dateInput, new Date());
}

/**
 * Formats a date into localized human string, e.g. "Thursday, Oct 22, 2026"
 */
export function formatLocalDate(dateInput, options = {}) {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  const defaultOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  };
  return new Intl.DateTimeFormat('en-US', defaultOptions).format(d);
}

/**
 * Formats local time from date string e.g. "9:00 AM" or "10:30 PM"
 */
export function formatLocalTime(dateInput) {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Formats month and year header, e.g. "October 2026"
 */
export function formatMonthYear(dateInput) {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Timezone-safe grouping of meetings by their local date string.
 * @param {Array} meetings - Array of meeting objects
 * @returns {Map<string, Array>} Map from 'YYYY-MM-DD' to Array of meetings
 */
export function groupMeetingsByLocalDate(meetings = []) {
  const map = new Map();
  if (!Array.isArray(meetings)) return map;

  for (const meeting of meetings) {
    if (!meeting || !meeting.start_time) continue;
    const dateKey = toLocalDateKey(meeting.start_time);
    if (!dateKey) continue;

    if (!map.has(dateKey)) {
      map.set(dateKey, []);
    }
    map.get(dateKey).push(meeting);
  }

  // Sort meetings within each day chronologically
  for (const [key, dayMeetings] of map.entries()) {
    dayMeetings.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }

  return map;
}

/**
 * Generates all calendar days (including previous and next month padding)
 * for a given month and year.
 */
export function getCalendarGridDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const gridDays = [];

  // Faded days from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    gridDays.push({
      date: new Date(year, month - 1, daysInPrevMonth - i),
      isCurrentMonth: false,
      dateKey: toLocalDateKey(new Date(year, month - 1, daysInPrevMonth - i)),
    });
  }

  // Days in current month
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const d = new Date(year, month, day);
    gridDays.push({
      date: d,
      isCurrentMonth: true,
      dateKey: toLocalDateKey(d),
    });
  }

  // Faded days from next month to complete standard 35 or 42 grid
  const remaining = gridDays.length <= 35 ? 35 - gridDays.length : 42 - gridDays.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    gridDays.push({
      date: d,
      isCurrentMonth: false,
      dateKey: toLocalDateKey(d),
    });
  }

  return gridDays;
}
