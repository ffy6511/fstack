import base64
import json
import os
import stat
import sys

# A fixed read-only protocol. No path or operation is evaluated as code.
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


def documents(base, dataset, suite):
    identifier(dataset, True)
    identifier(suite)
    path = within(base, os.path.join(base, dataset, '.ageval', 'suite-runs', suite))
    summary = optional(base, os.path.join(path, 'summary.json'))
    progress = None if summary is not None else optional(base, os.path.join(path, 'progress.json'))
    return {'dataset': dataset, 'suite': suite, 'summary': summary, 'progress': progress}


def perform():
    op = request['op']
    if op == 'home':
        return {'home': os.path.realpath(os.path.expanduser('~'))}
    if not isinstance(root, str) or not os.path.isabs(root) or '\x00' in root:
        raise ValueError('Choose an absolute remote directory')
    base = os.path.realpath(root)
    if not os.path.isdir(base):
        raise ValueError('Directory is unavailable')
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
                        doc = documents(base, dataset, entry.name)
                        # Return only fields used by the shared row projection.
                        src = doc['summary'] if doc['summary'] is not None else doc['progress'] or {}
                        fields = {k: src.get(k) for k in ('counts', 'model_label', 'agent_label', 'status', 'created_at', 'n_tasks', 'metrics') if k in src}
                        fields['n_tasks'] = src.get('n_tasks') or len(src.get('task_ids') or src.get('tasks') or src.get('task_refs') or []) or (src.get('metrics') or {}).get('n_tasks')
                        rows.append({'dataset': dataset, 'suite': entry.name, 'summary': fields if doc['summary'] is not None else None, 'progress': fields if doc['summary'] is None else None})
                    except (OSError, ValueError) as error:
                        warnings.append(dataset + '/' + entry.name + ': ' + str(error))
        return {'documents': rows, 'warnings': warnings}
    if op == 'suite':
        return documents(base, request['dataset'], request['suite'])
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
