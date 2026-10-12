"""Development-only independent oracle checker. Never writes or imports adapter code."""
import datetime as dt
import json
import pathlib
import platform
import sys
import zoneinfo

ROOT = pathlib.Path(__file__).resolve().parents[1]
UTC = dt.timezone.utc

def instant(text):
    return dt.datetime.fromisoformat(text.replace('Z', '+00:00')).astimezone(UTC)

def utc_text(value):
    return value.astimezone(UTC).isoformat(timespec='seconds').replace('+00:00', 'Z')

def offset_text(delta):
    seconds = int(delta.total_seconds())
    sign = '+' if seconds >= 0 else '-'
    seconds = abs(seconds)
    return f'{sign}{seconds // 3600:02}:{seconds % 3600 // 60:02}' + (f':{seconds % 60:02}' if seconds % 60 else '')

def possible(local, zone):
    # CPython fold/TZif round trips, independent of Temporal's Intl algorithm.
    answers = set()
    for fold in (0, 1):
        candidate = local.replace(tzinfo=zone, fold=fold).astimezone(UTC)
        if candidate.astimezone(zone).replace(tzinfo=None) == local:
            answers.add(candidate)
    return sorted(answers)

def reject(code):
    return {'status': 'rejected', 'reasonCode': code}

def recurrence(data):
    first = dt.date.fromisoformat(data['firstCandidateDate'])
    dates = [first + dt.timedelta(days=n) for n in range(data['horizonDays'])]
    if dates[-1].year > 2100:
        return reject('OUT_OF_RANGE')
    zone = zoneinfo.ZoneInfo(data['timeZone'])
    cursor = instant(data['strictlyAfter'])
    time = dt.time.fromisoformat(data['localTime'])
    for date in dates:
        start = dt.datetime.combine(date, dt.time(), zone).astimezone(UTC)
        end = dt.datetime.combine(date + dt.timedelta(days=1), dt.time(), zone).astimezone(UTC)
        if not 22 <= (end - start).total_seconds() / 3600 <= 26:
            return reject('UNSUPPORTED_RECURRENCE_TRANSITION')
    for date in dates:
        wall = dt.datetime.combine(date, time)
        values = possible(wall, zone)
        policy = 'exact'
        if len(values) == 0:
            projected = max(wall.replace(tzinfo=zone, fold=f).astimezone(UTC) for f in (0, 1))
            if data['gapPolicy'] == 'reject' and projected > cursor:
                return reject('NONEXISTENT_LOCAL_TIME')
            if data['gapPolicy'] != 'shift-by-gap' or projected <= cursor:
                continue
            chosen = projected
            policy = 'gap:shift-by-gap'
        elif len(values) == 2:
            if data['foldPolicy'] == 'reject':
                if values[-1] > cursor:
                    return reject('AMBIGUOUS_LOCAL_TIME')
                continue
            chosen = values[0 if data['foldPolicy'] == 'earlier' else 1]
            policy = 'fold:' + data['foldPolicy']
        else:
            chosen = values[0]
        if chosen <= cursor:
            continue
        resolved = chosen.astimezone(zone)
        # An independent arithmetic check: UTC = resolved wall time − TZif offset.
        assert (resolved.replace(tzinfo=None) - resolved.utcoffset()).replace(tzinfo=UTC) == chosen
        return {'status': 'value', 'value': {'nominalDate': date.isoformat(), 'resolvedLocalDateTime': resolved.replace(tzinfo=None).isoformat(timespec='seconds'), 'instant': utc_text(chosen), 'offset': offset_text(resolved.utcoffset()), 'appliedPolicy': policy}}
    return {'status': 'no-occurrence', 'reasonCode': 'NO_OCCURRENCE_IN_WINDOW'}

def check(fixture):
    data = fixture['input']
    if fixture['contract'] == 'date-only':
        try:
            date = dt.date.fromisoformat(data['date'])
            assert 1900 <= date.year <= 2100
            expected = {'status': 'value', 'value': date.isoformat()}
        except ValueError:
            expected = reject('INVALID_DATE')
    elif fixture['contract'] == 'day-bucket':
        if fixture['caseId'] == 'instant-missing-offset':
            assert not data['instant'].endswith('Z') and '+' not in data['instant'][10:]
            expected = reject('INVALID_INSTANT')
        elif fixture['caseId'] == 'bucket-invalid-zone':
            try:
                zoneinfo.ZoneInfo(data['timeZone'])
                raise AssertionError('Deliberate invalid identifier unexpectedly exists')
            except zoneinfo.ZoneInfoNotFoundError:
                expected = reject('INVALID_TIME_ZONE')
        else:
            expected = {'status': 'value', 'value': instant(data['instant']).astimezone(zoneinfo.ZoneInfo(data['timeZone'])).date().isoformat()}
            bounds = fixture['oracle']['dayBounds']
            assert instant(bounds['start']) <= instant(data['instant']) < instant(bounds['end'])
            assert (instant(bounds['end']) - instant(bounds['start'])).total_seconds() / 3600 == bounds['hours']
    else:
        expected = recurrence(data)
    assert expected == fixture['expected'], (fixture['caseId'], expected, fixture['expected'])
    for canary in fixture['oracle']['canaries']:
        local = instant(canary['instant']).astimezone(zoneinfo.ZoneInfo(canary['timeZone']))
        assert offset_text(local.utcoffset()) == canary['offset'], (fixture['caseId'], canary)
        assert local.replace(tzinfo=None).isoformat(timespec='seconds') == canary['localDateTime']
        assert (local.replace(tzinfo=None) - local.utcoffset()).replace(tzinfo=UTC) == instant(canary['instant'])
    for transition in fixture['oracle']['transitions']:
        zone = zoneinfo.ZoneInfo(data.get('timeZone', 'UTC'))
        boundary = instant(transition['instant'])
        assert offset_text((boundary - dt.timedelta(seconds=1)).astimezone(zone).utcoffset()) == transition['beforeOffset']
        assert offset_text(boundary.astimezone(zone).utcoffset()) == transition['afterOffset']
    for evidence in fixture['oracle']['candidates']:
        wall = dt.datetime.fromisoformat(evidence['nominalDate'] + 'T' + data['localTime'])
        values = possible(wall, zoneinfo.ZoneInfo(data['timeZone']))
        assert [utc_text(v) for v in values] == evidence['instants']
        if 'forwardProjection' in evidence:
            projection = max(wall.replace(tzinfo=zoneinfo.ZoneInfo(data['timeZone']), fold=f).astimezone(UTC) for f in (0, 1))
            assert utc_text(projection) == evidence['forwardProjection']

fixtures = [json.loads(p.read_text()) for p in sorted((ROOT / 'cases').glob('*/*.json'))]
for fixture in fixtures:
    check(fixture)
tzversion = 'unknown'
for base in zoneinfo.TZPATH:
    version_file = pathlib.Path(base) / '+VERSION'
    zi_file = pathlib.Path(base) / 'tzdata.zi'
    if version_file.exists():
        tzversion = version_file.read_text().strip()
        break
    if zi_file.exists():
        tzversion = zi_file.read_text().splitlines()[0].replace('# version ', '')
        break
print(json.dumps({'checkedCases': len(fixtures), 'python': sys.version.split()[0], 'platform': platform.system(), 'tzdata': tzversion, 'TZPATH': zoneinfo.TZPATH, 'method': 'CPython zoneinfo/TZif plus explicit UTC arithmetic; expected fixtures unchanged'}))
