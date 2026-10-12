import type { ChronoAdapter, DateOnlyInput, DateOutcome } from 'chronocases';
import { dateOnlyRoundtrip as serializeDate, instantToDayBucket, nextOccurrence } from 'chronocases/reference';
// Replace serializeDate with your product's actual save/read function.
export function dateOnlyRoundtrip(input: DateOnlyInput): DateOutcome { return serializeDate(input); }
export { instantToDayBucket, nextOccurrence };
export const adapter = { dateOnlyRoundtrip, instantToDayBucket, nextOccurrence } satisfies ChronoAdapter;
