"""Operator-intent rotation; generated secrets only exist in memory/current-user DPAPI."""
import hashlib
import json
import secrets
from pathlib import Path
import urllib.error


def replace_identity(path, value, protect):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_bytes(protect(json.dumps(value).encode('utf-8')))
    temporary.replace(path)


def recover(client, root, protect):
    pending = Path(root) / 'identity-next.dpapi'
    if not pending.exists():
        return False
    candidate = json.loads(protect(pending.read_bytes(), decrypt=True))
    old = client.identity
    client.identity = candidate
    try:
        client.post('credentials/' + candidate['rotationId'] + '/ack', {})
    except urllib.error.HTTPError as error:
        client.identity = old
        if error.code not in (401, 409):
            raise
        # A crash before server commit: retry exactly the staged candidate under old identity.
        client.post('credentials/commit', dict(rotationId=candidate['rotationId'], generation=candidate['generation'],
            candidateHash=hashlib.sha256(candidate['credential'].encode()).hexdigest()))
        client.identity = candidate
        client.post('credentials/' + candidate['rotationId'] + '/ack', {})
    except Exception:
        client.identity = old
        raise
    replace_identity(Path(root) / 'identity.dpapi', candidate, protect)
    pending.unlink()
    return True


def rotate_if_requested(client, root, protect):
    if recover(client, root, protect):
        return True
    intent = client.post('credentials/poll', {})
    if intent['state'] != 'REQUESTED':
        return False
    candidate = dict(client.identity, credential=secrets.token_urlsafe(32), generation=intent['generation'], rotationId=intent['id'])
    # Persist before changing the server hash. Either identity can recover a lost commit response.
    replace_identity(Path(root) / 'identity-next.dpapi', candidate, protect)
    return recover(client, root, protect)
