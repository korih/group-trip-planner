import { format, eachDayOfInterval, parseISO, isToday, isBefore, isAfter } from 'date-fns';

export function formatDate(date: string | Date, fmt = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/** Returns all ISO date strings between start and end (inclusive) */
export function getTripDays(startDate: string, endDate: string): string[] {
  return eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  }).map((d) => format(d, 'yyyy-MM-dd'));
}

export function tripDayLabel(date: string, tripStartDate: string): string {
  const days = getTripDays(tripStartDate, date);
  return `Day ${days.length}`;
}

export { isToday, isBefore, isAfter, parseISO, format };
