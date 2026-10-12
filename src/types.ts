export const CONTRACTS = ['date-only', 'day-bucket', 'recurrence'] as const;
export type Contract = typeof CONTRACTS[number];
export interface DateOnlyInput { date: string; storageTimeZone: string; displayTimeZone: string }
export interface DayBucketInput { instant: string; timeZone: string }
export interface RecurrenceInput {
  timeZone: string; localTime: string; firstCandidateDate: string; horizonDays: number;
  strictlyAfter: string; gapPolicy: 'skip' | 'shift-by-gap' | 'reject'; foldPolicy: 'earlier' | 'later' | 'reject';
}
export interface Occurrence {
  nominalDate: string; resolvedLocalDateTime: string; instant: string; offset: string;
  appliedPolicy: 'exact' | 'gap:shift-by-gap' | 'fold:earlier' | 'fold:later';
}
export const REASON_CODES = ['INVALID_DATE', 'INVALID_INSTANT', 'INVALID_TIME_ZONE', 'INVALID_LOCAL_TIME', 'INVALID_WINDOW', 'INVALID_POLICY', 'OUT_OF_RANGE', 'AMBIGUOUS_LOCAL_TIME', 'NONEXISTENT_LOCAL_TIME', 'UNSUPPORTED_RECURRENCE_TRANSITION'] as const;
export type ReasonCode = typeof REASON_CODES[number];
export type Rejected = { status: 'rejected'; reasonCode: ReasonCode };
export type DateOutcome = { status: 'value'; value: string } | Rejected;
export type RecurrenceOutcome = { status: 'value'; value: Occurrence } | Rejected | { status: 'no-occurrence'; reasonCode: 'NO_OCCURRENCE_IN_WINDOW' };
export type Outcome = DateOutcome | RecurrenceOutcome;
export type Input = DateOnlyInput | DayBucketInput | RecurrenceInput;
export interface AdapterMetadata { caseId: string; contractVersion: '1' }
export interface ChronoAdapter {
  dateOnlyRoundtrip?: (input: DateOnlyInput, metadata: AdapterMetadata) => DateOutcome | Promise<DateOutcome>;
  instantToDayBucket?: (input: DayBucketInput, metadata: AdapterMetadata) => DateOutcome | Promise<DateOutcome>;
  nextOccurrence?: (input: RecurrenceInput, metadata: AdapterMetadata) => RecurrenceOutcome | Promise<RecurrenceOutcome>;
}
export interface Canary { timeZone: string; instant: string; offset: string; localDateTime: string }
export interface Evidence {
  method: string; calculation: string; canaries: Canary[];
  transitions: { instant: string; beforeOffset: string; afterOffset: string; note: string }[];
  candidates: { nominalDate: string; instants: string[]; forwardProjection?: string }[];
  dayBounds?: { start: string; end: string; hours: number };
}
export interface ChronoCase {
  schemaVersion: '1'; caseId: string; contract: Contract; contractVersion: '1'; title: string;
  tags: string[]; inputValidity: 'valid' | 'invalid' | 'unsupported'; input: Input;
  expected: Outcome; rationale: string; sources: string[]; oracle: Evidence; reviewedAt: string;
}
export interface Provenance {
  node: string; platform: string; osRelease: string; arch: string; icu: string; tzdata: string;
  processTZ: string; adapterProcessTZ: string; defaultTimeZone: string; supportedTimeZones: string[];
  temporal: { implementation: string; version: string; timezoneDatabase: string };
  corpusVersion: string; corpusHash: string;
}
export type ResultStatus = 'PASS' | 'FAIL' | 'ADAPTER_ERROR' | 'UNSUPPORTED' | 'INTERRUPTED';
export interface CaseResult {
  caseId: string; contract: Contract; status: ResultStatus; expected: Outcome; actual: unknown;
  explanation: string; reasonCode: string | null; repro: string; durationMs: number;
  logs: { stdout: string; stderr: string; truncated: boolean }; fixture: ChronoCase;
}
export interface Summary {
  selectedContracts: Contract[]; selected: number; passed: number; failed: number;
  adapterErrors: number; unsupported: number; interrupted: number; exitCode: 0 | 1 | 2 | 3 | 130;
}
export interface Report {
  schemaVersion: '1'; packageVersion: string; createdAt: string; adapter: string;
  provenance: Provenance; summary: Summary; results: CaseResult[];
}
