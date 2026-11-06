import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from codex_usage import CodexUsageCollector, normalize


class FakeProcess:
    def __init__(self, messages):
        self.stdin = io.StringIO()
        self.stdout = io.StringIO("\n".join(json.dumps(m) for m in messages) + "\n")
        self.closed = False
    def poll(self):
        return None
    def close(self):
        self.closed = True


class UsageCollectorTest(unittest.TestCase):
    def schema(self, root, methods):
        directory = Path(root) / 'schema-0.162.1'
        (directory / 'v1').mkdir(parents=True)
        (directory / 'ClientRequest.json').write_text(json.dumps({'oneOf': [{'properties': {'method': {'enum': [m]}}} for m in methods]}), encoding='utf-8')
        (directory / 'v1/InitializeParams.json').write_text(json.dumps({'definitions': {'InitializeCapabilities': {'properties': {'explicitGatewayOauth': {}}}}}), encoding='utf-8')
    def collect(self, messages, methods=('initialize', 'account/rateLimits/read', 'account/usage/read'), timeout=.3):
        with tempfile.TemporaryDirectory() as temp:
            self.schema(temp, methods)
            collector = CodexUsageCollector(temp, timeout=timeout)
            collector.executable = 'fixture.exe'
            process = FakeProcess(messages)
            with patch.object(collector, 'capture_public', return_value=(0,'codex-cli 0.162.1')), patch('codex_usage.JobProcess', return_value=process):
                result = collector.collect(1)
            return result, process
    def test_both_windows_are_identified_by_duration_not_primary_and_secrets_are_dropped(self):
        rate = {'accountId':'private@example.com','rateLimits':{'primary':{'usedPercent':40,'windowDurationMins':10080,'resetsAt':2000000000},
            'secondary':{'usedPercent':85,'windowDurationMins':300,'resetsAt':1999999900},'credits':{'balance':'12.5','hasCredits':True,'unlimited':False}}}
        result, process = self.collect([{'id':1,'result':{}},{'id':2,'result':rate},{'id':3,'result':{'summary':{'lifetimeTokens':123,'peakDailyTokens':50},'prompt':'private prompt'}}])
        self.assertEqual('OK', result['status']);self.assertEqual([10080,300],[w['windowDurationMins'] for w in result['windows']])
        self.assertNotIn('private',json.dumps(result));self.assertEqual(123,result['tokens']['lifetimeTokens'])
        messages=[json.loads(line) for line in process.stdin.getvalue().splitlines()]
        self.assertEqual(['initialize','initialized','account/rateLimits/read','account/usage/read'],[m['method'] for m in messages])
        self.assertTrue(messages[0]['params']['capabilities']['explicitGatewayOauth']);self.assertTrue(process.closed)
    def test_weekly_only_and_no_data_never_invent_five_hour(self):
        result=normalize({'rateLimits':{'primary':{'usedPercent':10,'windowDurationMins':10080,'resetsAt':2000000000}}})
        self.assertEqual([10080],[w['windowDurationMins'] for w in result['windows']])
        self.assertEqual('NO_DATA',normalize({})['status'])
        self.assertEqual([],normalize({})['windows'])
    def test_missing_cli_unsupported_protocol_not_signed_in_and_timeout(self):
        with tempfile.TemporaryDirectory() as temp:
            collector=CodexUsageCollector(temp);collector.executable=None
            self.assertEqual('CLI_NOT_FOUND',collector.collect(1)['status'])
        result,_=self.collect([],methods=('initialize',))
        self.assertEqual('UNSUPPORTED',result['status'])
        result,_=self.collect([{'id':1,'result':{}},{'id':2,'error':{'code':-32000,'message':'Not logged in private@example.com'}}])
        self.assertEqual('NOT_AUTHENTICATED',result['status']);self.assertNotIn('private',json.dumps(result))
        result,_=self.collect([],timeout=.02)
        self.assertEqual('TIMEOUT',result['status'])
    def test_updates_merge_without_dropping_omitted_weekly_and_optional_usage_method(self):
        rate={'rateLimits':{'primary':{'usedPercent':10,'windowDurationMins':300,'resetsAt':2000000000},'secondary':{'usedPercent':20,'windowDurationMins':10080,'resetsAt':2000000000}}}
        result,_=self.collect([{'id':1,'result':{}},{'id':2,'result':rate},{'method':'account/rateLimits/updated','params':{'rateLimits':{'primary':{'usedPercent':30}}}},{'id':3,'result':{}}])
        self.assertEqual([30,20],[w['usedPercent'] for w in result['windows']])
        result,process=self.collect([{'id':1,'result':{}},{'id':2,'result':rate}],methods=('initialize','account/rateLimits/read'))
        self.assertEqual('OK',result['status']);self.assertNotIn('account/usage/read',process.stdin.getvalue())


if __name__=='__main__':
    unittest.main()
