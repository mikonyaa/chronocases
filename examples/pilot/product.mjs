import { readFile, writeFile } from 'node:fs/promises';

// A small independent booking policy: dates accepted by this product are 2020–2030.
// No timezone conversion belongs in storage of a selected calendar date.
export async function persistBookingDate(date, file = 'booking.json') {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: 'rejected', reasonCode: 'INVALID_DATE' };
  const [year, month, day] = date.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > lengths[month - 1]) return { status: 'rejected', reasonCode: 'INVALID_DATE' };
  if (year < 2020 || year > 2030) return { status: 'rejected', reasonCode: 'OUT_OF_RANGE' };
  await writeFile(file, JSON.stringify({ bookingDate: date }) + '\n');
  return { status: 'value', value: JSON.parse(await readFile(file, 'utf8')).bookingDate };
}
