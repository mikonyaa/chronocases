import { isNamedTimeZone, instantToDayBucket, nextOccurrence } from 'chronocases/reference';
import { saveDateOnly, readDateOnly } from './product.mjs';
export function dateOnlyRoundtrip(input) {
  const saved = saveDateOnly(input.date);
  if ('status' in saved) return saved;
  if (!isNamedTimeZone(input.storageTimeZone) || !isNamedTimeZone(input.displayTimeZone)) return { status: 'rejected', reasonCode: 'INVALID_TIME_ZONE' };
  return { status: 'value', value: readDateOnly(saved.serialized) };
}
export { instantToDayBucket, nextOccurrence };
