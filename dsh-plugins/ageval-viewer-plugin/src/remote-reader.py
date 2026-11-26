import base64
import json
import os
import stat
import sys
import hashlib
import uuid
from datetime import datetime, timezone

# Fixed operations only. Removal moves confirmed suite directories, never attempts.
request = json.loads(base64.b64decode(sys.argv[1]))
root = request.get('path', '')
MAX_JSON = 16 * 1024 * 1024
MAX_DIRS = 500


def within(base, path):
    base, path = os.path.realpath(base), os.path.realpath(path)
    if os.path.commonpath([base, path]) != base:
        raise ValueError('Path escapes selected dataset root')
    return path


def identifier(value, allow_dot=False):
    if allow_dot and value == '.':
        return value
    if not isinstance(value, str) or not value or value in ('.', '..') or any(c in value for c in '/\\\x00'):
        raise ValueError('Invalid evidence identifier')
    return value


def bounded(base, path, cap, truncate=False):
    path = within(base, path)
    # Never open a FIFO, device or socket, and reject symlinks at the leaf.
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise ValueError('Evidence is not a regular file')
        if info.st_size > cap and not truncate:
            raise ValueError('Evidence exceeds read limit')
        data = handle.read(cap)
    cut = info.st_size > len(data)
    if cut and path.endswith('.jsonl'):
        # A partial JSONL record is not a valid step.
        data = data[:data.rfind(b'\n') + 1] if b'\n' in data else b''
    return {'text': data.decode('utf-8', 'replace'), 'bytes': info.st_size, 'truncated': cut}


def optional(base, path):
    try:
        return json.loads(bounded(base, path, MAX_JSON)['text'])
    except FileNotFoundError:
        return None


def file_time(base, dataset, suite):
    identifier(dataset, True)
    identifier(suite)
    path = within(base, os.path.join(base, dataset, '.ageval', 'suite-runs', suite))
    mtimes = []
    for name in ('summary.json', 'progress.json'):
        try:
            info = os.stat(within(base, os.path.join(path, name)))
            if stat.S_ISREG(info.st_mode):
                mtimes.append(info.st_mtime)
        except FileNotFoundError:
            pass
    return datetime.fromtimestamp(max(mtimes), timezone.utc).isoformat() if mtimes else None


def documents(base, dataset, suite, include_file_time=True):
    identifier(dataset, True)
    identifier(suite)
    path = within(base, os.path.join(base, dataset, '.ageval', 'suite-runs', suite))
    summary = optional(base, os.path.join(path, 'summary.json'))
    progress = None if summary is not None else optional(base, os.path.join(path, 'progress.json'))
    src = summary if summary is not None else progress or {}
    modified = file_time(base, dataset, suite) if include_file_time and not (src.get('updated_at') or src.get('finished_at')) else None
    return {'dataset': dataset, 'suite': suite, 'summary': summary, 'progress': progress, 'modifiedAt': modified}


def inspect_record(base, dataset, suite):
    identifier(dataset, True)
    identifier(suite)
    target = os.path.join(base, dataset, '.ageval', 'suite-runs', suite)
    target = os.path.normpath(target)
    current = base
    for part in os.path.relpath(target, base).split(os.sep):
        current = os.path.join(current, part)
        info = os.lstat(current)
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            raise ValueError('Suite path must contain real directories only')
    if within(base, target) != target:
        raise ValueError('Suite path changed')
    info = os.lstat(target)
    docs, status_value = [], ''
    for name in ('summary.json', 'progress.json'):
        path = os.path.join(target, name)
        try:
            if stat.S_ISLNK(os.lstat(path).st_mode):
                raise ValueError('Suite evidence symlink is not removable')
            value = bounded(base, path, MAX_JSON)['text']
            data = json.loads(value)
            status_value = status_value or data.get('status', '')
            docs.append([name, value])
        except FileNotFoundError:
            pass
    if status_value not in ('complete', 'failed', 'error', 'cancelled', 'canceled', 'interrupted'):
        raise ValueError('Only terminal suite records can be removed; running or unknown status is protected')
    fingerprint = hashlib.sha256(json.dumps([target, info.st_dev, info.st_ino, info.st_mtime_ns, info.st_ctime_ns, docs]).encode()).hexdigest()
    return {'dataset': dataset, 'suite': suite, 'path': target, 'status': status_value, 'fingerprint': fingerprint}


def task_timing(base, dataset, src, task, run):
    identifier(task)
    refs = [t for t in (src.get('tasks') or []) + (src.get('task_refs') or []) if t.get('task_id') == task]
    run = run or next((t.get('run_id') for t in refs if t.get('run_id')), None)
    identifier(run)
    ids = [r for t in refs for r in [t.get('run_id')] + (t.get('attempt_run_ids') or [])]
    if run not in ids:
        raise ValueError('Attempt does not belong to selected task')
    for path in [os.path.join(base, dataset, '.ageval', 'runs', run, 'summary.json'), os.path.join(base, dataset, 'tasks', task, '.ageval', 'runs', run, 'summary.json')]:
        summary = optional(base, path)
        if summary is not None:
            return {k: summary.get(k) for k in ('phase_timing', 'started_at', 'started', 'finished_at', 'finished', 'duration_ms') if k in summary}
    raise ValueError('Attempt summary is unavailable on this source')


def tracking_discover(base, scope, baseline):
    if scope not in ('dataset', 'parent') or not isinstance(baseline, bool):
        raise ValueError('Invalid tracking discovery scope')
    datasets, candidates = [], []
    scanned, bytes_read = 0, 0

    def is_real_dir(path):
        try:
            return stat.S_ISDIR(os.lstat(path).st_mode)
        except FileNotFoundError:
            return False

    def usable(directory):
        nonlocal scanned
        with os.scandir(directory) as entries:
            for entry in entries:
                scanned += 1
                if scanned > 20000:
                    raise ValueError('Too many directory entries; choose a narrower directory')
                if entry.is_dir(follow_symlinks=False) and not entry.name.startswith('.') and '\\' not in entry.name:
                    yield entry.name

    def terminal(directory):
        nonlocal bytes_read
        for name in ('summary.json', 'progress.json'):
            path = os.path.join(directory, name)
            try:
                if not stat.S_ISREG(os.lstat(path).st_mode):
                    continue
                if within(base, path) != path:
                    raise ValueError('Suite metadata path changed')
                fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | getattr(os, 'O_NOFOLLOW', 0))
                with os.fdopen(fd, 'rb') as handle:
                    info = os.fstat(handle.fileno())
                    if not stat.S_ISREG(info.st_mode):
                        continue
                    bytes_read += info.st_size
                    if info.st_size > MAX_JSON or bytes_read > 128 * 1024 * 1024:
                        raise ValueError('Baseline metadata exceeds read limit; choose a narrower directory')
                    raw = handle.read(info.st_size)
                try:
                    value = json.loads(raw.decode('utf-8', 'replace'))
                except (ValueError, RecursionError):
                    continue
                if isinstance(value, dict) and isinstance(value.get('status'), str) and value['status']:
                    return value['status'] in ('complete', 'failed', 'error', 'cancelled', 'canceled', 'interrupted')
            except FileNotFoundError:
                continue
        return False

    def scan(dataset, directory):
        metadata = os.path.join(directory, '.ageval')
        suites = os.path.join(metadata, 'suite-runs')
        has_suites = is_real_dir(metadata) and is_real_dir(suites)
        if not has_suites and dataset != '.':
            try:
                if not stat.S_ISREG(os.lstat(os.path.join(directory, 'ageval.yaml')).st_mode):
                    return
            except FileNotFoundError:
                return
        if len(datasets) == 500:
            raise ValueError('Too many datasets; choose a narrower directory')
        datasets.append(dataset)
        if has_suites:
            if within(base, suites) != suites:
                raise ValueError('Suite directory changed')
            for suite in usable(suites):
                if len(candidates) == 2000:
                    raise ValueError('Too many suite runs to scan; choose a narrower directory')
                candidates.append({'dataset': dataset, 'suite': suite, 'terminal': baseline and terminal(os.path.join(suites, suite))})

    if scope == 'dataset':
        scan('.', base)
    else:
        for dataset in usable(base):
            scan(dataset, os.path.join(base, dataset))
    return {'path': base, 'datasets': sorted(datasets), 'candidates': candidates}


def perform():
    op = request['op']
    if op == 'home':
        return {'home': os.path.realpath(os.path.expanduser('~'))}
    if not isinstance(root, str) or not os.path.isabs(root) or '\x00' in root:
        raise ValueError('Choose an absolute remote directory')
    base = os.path.realpath(root)
    if not os.path.isdir(base):
        raise ValueError('Directory is unavailable')
    if op == 'tracking_discover':
        return tracking_discover(base, request.get('scope'), request.get('baseline'))
    if op == 'remove_preview':
        return inspect_record(base, request['dataset'], request['suite'])
    if op == 'remove_confirm':
        expected = request['expected']
        current = inspect_record(base, expected['dataset'], expected['suite'])
        if current['path'] != expected['path'] or current['fingerprint'] != expected['fingerprint']:
            raise ValueError('Suite changed after confirmation; preview again')
        trash = os.path.join(os.path.dirname(os.path.dirname(current['path'])), 'suite-run-trash')
        if not os.path.lexists(trash):
            os.mkdir(trash, 0o700)
        info = os.lstat(trash)
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or os.path.realpath(trash) != trash:
            raise ValueError('Recycle path must be a real directory')
        destination = os.path.join(trash, current['suite'] + '-' + str(uuid.uuid4()))
        checked = inspect_record(base, expected['dataset'], expected['suite'])
        if checked['fingerprint'] != expected['fingerprint']:
            raise ValueError('Suite changed after confirmation; preview again')
        os.rename(current['path'], destination)
        return {'dataset': current['dataset'], 'suite': current['suite'], 'from': current['path'], 'to': destination}
    if op == 'resolve':
        return {'path': base}
    if op == 'list_dirs':
        entries = []
        capped = False
        with os.scandir(base) as children:
            for entry in children:
                # File picking does not need stat calls into symbolic links.
                if entry.name.startswith('.') or not entry.is_dir(follow_symlinks=False):
                    continue
                if len(entries) >= MAX_DIRS:
                    capped = True
                    break
                entries.append({'name': entry.name, 'path': entry.path})
        return {'path': base, 'entries': sorted(entries, key=lambda e: e['name']), 'truncated': capped}
    if op == 'suites':
        groups, rows, warnings = [], [], []
        if os.path.isdir(os.path.join(base, '.ageval', 'suite-runs')):
            groups = ['.']
        else:
            with os.scandir(base) as children:
                for child in children:
                    if len(groups) >= MAX_DIRS:
                        warnings.append('Dataset list capped at 500')
                        break
                    if child.is_dir(follow_symlinks=False) and not child.name.startswith('.'):
                        path = within(base, os.path.join(child.path, '.ageval', 'suite-runs'))
                        if os.path.isdir(path):
                            groups.append(child.name)
        for dataset in sorted(groups):
            directory = within(base, os.path.join(base, dataset, '.ageval', 'suite-runs'))
            with os.scandir(directory) as suites:
                for entry in suites:
                    if len(rows) >= 2000:
                        warnings.append('Suite list capped at 2000')
                        return {'documents': rows, 'warnings': warnings}
                    if not entry.is_dir(follow_symlinks=False):
                        continue
                    try:
                        doc = documents(base, dataset, entry.name, False)
                        # Return only fields used by the shared row projection.
                        src = doc['summary'] if doc['summary'] is not None else doc['progress'] or {}
                        fields = {k: src.get(k) for k in ('counts', 'model_label', 'agent_label', 'status', 'created_at', 'updated_at', 'started_at', 'finished_at', 'duration_ms', 'n_tasks', 'metrics') if k in src}
                        fields['n_tasks'] = src.get('n_tasks') or len(src.get('task_ids') or src.get('tasks') or src.get('task_refs') or []) or (src.get('metrics') or {}).get('n_tasks')
                        rows.append({'dataset': dataset, 'suite': entry.name, 'summary': fields if doc['summary'] is not None else None, 'progress': fields if doc['summary'] is None else None, 'modifiedAt': doc['modifiedAt']})
                    except (OSError, ValueError) as error:
                        warnings.append(dataset + '/' + entry.name + ': ' + str(error))
        return {'documents': rows, 'warnings': warnings}
    if op == 'suite_times':
        items = request.get('items')
        if not isinstance(items, list) or not 1 <= len(items) <= 50:
            raise ValueError('Request 1–50 suite timestamps')
        results = []
        for item in items:
            dataset, suite = item.get('dataset'), item.get('suite')
            identifier(dataset, True)
            identifier(suite)
            try:
                results.append({'dataset': dataset, 'suite': suite, 'updatedAt': file_time(base, dataset, suite), 'updatedAtSource': 'evidence-mtime'})
            except (OSError, ValueError) as error:
                results.append({'dataset': dataset, 'suite': suite, 'error': str(error)[:700]})
        return {'results': results}
    if op == 'suite':
        return documents(base, request['dataset'], request['suite'])
    if op in ('timing', 'timings'):
        dataset, suite = request['dataset'], request['suite']
        doc = documents(base, dataset, suite)
        src = doc['summary'] if doc['summary'] is not None else doc['progress'] or {}
        if op == 'timing':
            return task_timing(base, dataset, src, request['task'], request.get('run'))
        items = request.get('items')
        if not isinstance(items, list) or not 1 <= len(items) <= 50:
            raise ValueError('Request 1–50 task timings')
        results = []
        for item in items:
            task, run = item.get('task'), item.get('run')
            identifier(task)
            identifier(run)
            try:
                results.append({'taskId': task, 'runId': run, 'raw': task_timing(base, dataset, src, task, run)})
            except (OSError, ValueError, TypeError) as error:
                results.append({'taskId': task, 'runId': run, 'error': str(error)[:700]})
        return {'results': results}
    if op == 'attempt':
        dataset, suite, task = request['dataset'], request['suite'], request['task']
        identifier(task)
        doc = documents(base, dataset, suite)
        src = doc['summary'] if doc['summary'] is not None else doc['progress'] or {}
        refs = [t for t in (src.get('tasks') or []) + (src.get('task_refs') or []) if t.get('task_id') == task]
        run = request.get('run') or next((t.get('run_id') for t in refs if t.get('run_id')), None)
        identifier(run)
        ids = [r for t in refs for r in [t.get('run_id')] + (t.get('attempt_run_ids') or [])]
        if run not in ids:
            raise ValueError('Attempt does not belong to selected task')
        candidates = [os.path.join(base, dataset, '.ageval', 'runs', run), os.path.join(base, dataset, 'tasks', task, '.ageval', 'runs', run)]
        directory = next((within(base, p) for p in candidates if os.path.isdir(p)), None)
        if directory is None:
            raise FileNotFoundError('Attempt evidence is not on this host')
        files = {}
        for name in ['result.json', 'summary.json', 'trajectory.jsonl', 'evaluation/observation.jsonl', 'evaluation/checks.json']:
            try:
                files[name] = bounded(base, os.path.join(directory, name), 1024 * 1024, True)
            except FileNotFoundError:
                pass
        return {'dataset': dataset, 'suite': suite, 'taskId': task, 'runId': run, 'files': files}
    raise ValueError('Unknown operation')


try:
    print(json.dumps({'ok': True, 'value': perform()}, ensure_ascii=True))
except (OSError, ValueError, KeyError, TypeError) as error:
    print(json.dumps({'ok': False, 'error': str(error), 'code': getattr(error, 'errno', None)}))
