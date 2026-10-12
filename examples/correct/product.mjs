// A real serialization/deserialization path for the date-only example.
import { parseCalendarDate } from 'chronocases/reference';
export function saveDateOnly(date) {
  const checked = parseCalendarDate(date);
  if ('status' in checked) return checked;
  return { serialized: JSON.stringify({ selectedDate: checked.parsed.toString() }) };
}
export function readDateOnly(serialized) { return JSON.parse(serialized).selectedDate; }
