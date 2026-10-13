import { persistBookingDate } from './product.mjs';
export function dateOnlyRoundtrip(input, metadata) {
  if (Object.keys(metadata).sort().join(',') !== 'caseId,contractVersion') throw Error('Unexpected adapter metadata');
  return persistBookingDate(input.date);
}
