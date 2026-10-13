// Independent of production reference helpers. This is an ordinary consumer log.
export const payload = [
  'literal $& end',
  'literal $$ end',
  'literal $` end',
  "literal $' end",
  'Цена 💡 résumé',
  '</script><img src=x onerror="globalThis.auditInjected=true">',
  'separators \u2028 \u2029',
  '/*__SCRIPT__*/ /*__DATA__*/'
].join('\n') + '\n';

export function dateOnlyRoundtrip(input) {
  process.stdout.write(payload);
  process.stderr.write(payload);
  return { status: 'value', value: input.date };
}
