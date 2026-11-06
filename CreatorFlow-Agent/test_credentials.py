import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
import uuid
from agent import protect
from credentials import replace_identity, recover, rotate_if_requested


class RotationTest(unittest.TestCase):
    def scenario(self, failure):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);old=dict(id=str(uuid.uuid4()),credential='old-fixture-secret',backend='http://127.0.0.1:8082');rotation=str(uuid.uuid4())
            replace_identity(root/'identity.dpapi',old,protect)
            class Client:
                identity=old.copy();active_hash=hashlib.sha256(old['credential'].encode()).hexdigest();state='REQUESTED';failed=False
                def post(self,path,body):
                    if hashlib.sha256(self.identity['credential'].encode()).hexdigest()!=self.active_hash:raise urllib.error.HTTPError('http://127.0.0.1',401,'fixture',{},None)
                    if path=='credentials/poll':return dict(id=rotation,generation=2,state=self.state)
                    if path=='credentials/commit':
                        if failure=='before' and not self.failed:self.failed=True;raise OSError('interrupted before commit')
                        self.active_hash=body['candidateHash'];self.state='COMMITTED'
                        if failure=='after' and not self.failed:self.failed=True;raise OSError('lost commit response')
                        return {'committed':True}
                    self.state='ACKED';return dict(state='ACKED',generation=2)
            client=Client()
            if failure:
                with self.assertRaises(OSError):rotate_if_requested(client,root,protect)
                client.identity=json.loads(protect((root/'identity.dpapi').read_bytes(),True))
                self.assertTrue(recover(client,root,protect))
            else:self.assertTrue(rotate_if_requested(client,root,protect))
            persisted=json.loads(protect((root/'identity.dpapi').read_bytes(),True))
            self.assertEqual(2,persisted['generation']);self.assertNotEqual(old['credential'],persisted['credential'])
            self.assertNotIn(persisted['credential'].encode(),(root/'identity.dpapi').read_bytes())
            self.assertFalse((root/'identity-next.dpapi').exists());self.assertEqual('ACKED',client.state)
    def test_atomic_dpapi_rotation(self):self.scenario(None)
    def test_restart_before_commit_recovers_same_candidate(self):self.scenario('before')
    def test_restart_after_commit_with_lost_response_recovers(self):self.scenario('after')
