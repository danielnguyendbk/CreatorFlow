import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { publicationApi } from '@/api/publicationApi';
import { publicationReviewApi } from '@/api/publicationReviewApi';
import { Button, Input, PageHeader, Textarea } from '@/components/ui';
import type { PublicationJob, PublicationManifest, PublicationReview } from '@/types';

function Preview({ assetId, checksum, onVerified }: { assetId?: string; checksum?: string; onVerified: (ok: boolean) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = ''; let active = true;
    setUrl(''); setError(''); onVerified(false);
    if (assetId) void (async () => {
      try {
        const token = sessionStorage.getItem('creatorflow_api_token');
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/assets/${encodeURIComponent(assetId)}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
        if (!response.ok) throw new Error(`Preview unavailable: HTTP ${response.status}`);
        const blob = await response.blob();
        if (checksum) {
          const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
          const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
          if (actual !== checksum) throw new Error('Preview checksum differs from this immutable manifest. Create a new verified revision.');
        }
        if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); onVerified(Boolean(checksum)); }
      } catch (cause) { if (active) setError((cause as Error).message); }
    })();
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId, checksum, onVerified]);
  return <section className="space-y-2" aria-label="Video preview">
    <h2 className="font-semibold">Video preview</h2>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {url ? <video className="max-h-96 w-full rounded-lg bg-black" controls playsInline preload="metadata" src={url} aria-label="Final publication video" /> : !error && <p role="status" className="text-sm text-zinc-400">{assetId ? 'Loading and checking video bytes…' : 'No successful final render'}</p>}
    <p className="text-xs text-zinc-400">{checksum ? 'Preview bytes are checked against the selected manifest SHA-256.' : 'Unbound render preview. Create a manifest before approval.'}</p>
  </section>;
}

const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not available';
function changes(current: PublicationManifest, previous?: PublicationManifest) {
  if (!previous) return ['No prior approved revision'];
  const fields: [string, unknown, unknown][] = [
    ['Title', current.metadata.title, previous.metadata.title], ['Caption', current.metadata.caption, previous.metadata.caption],
    ['Description', current.metadata.description, previous.metadata.description], ['Hashtags', current.metadata.hashtags, previous.metadata.hashtags],
    ['Video SHA-256', current.media.sha256, previous.media.sha256], ['Render', current.finalRenderJobId, previous.finalRenderJobId],
    ['Platform', current.targetPlatform, previous.targetPlatform], ['Connection', current.connectionId, previous.connectionId],
    ['Connection revision', current.connectionRevision, previous.connectionRevision], ['Visibility', current.visibility, previous.visibility],
    ['Intended schedule', current.intendedSchedule, previous.intendedSchedule], ['Storyboard version', current.storyboardVersion, previous.storyboardVersion],
    ['Source artifact evidence', current.artifactReferences, previous.artifactReferences],
  ];
  const changed = fields.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b)).map(([name]) => name);
  return changed.length ? changed : ['No approved payload changes'];
}

export function PublicationReviewPage() {
  const { id = '' } = useParams();
  const job = useQuery({ queryKey: ['publication', id], queryFn: () => publicationApi.getPublication(id), retry: false });
  const review = useQuery({ queryKey: ['publication-review', id], queryFn: () => publicationReviewApi.get(id), retry: false });
  return <div className="space-y-6">
    <PageHeader title="Content Publication Review" description="Review and approve one immutable video, metadata and account revision." />
    <Link to="/publication-queue" className="text-sm text-blue-400 underline">Back to Publication Queue</Link>
    {(job.isPending || review.isPending) && <p role="status">Loading publication evidence…</p>}
    {[job.error, review.error].filter(Boolean).map((e, i) => <p role="alert" key={i} className="text-red-400">{(e as Error).message}</p>)}
    {job.data && review.data && <ReviewContent key={id} job={job.data} review={review.data} />}
  </div>;
}

function ReviewContent({ job, review }: { job: PublicationJob; review: PublicationReview }) {
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const selected = review.manifests.find(m => m.manifestId === (selectedId || review.activeManifestId)) ?? review.manifests[0];
  const [title, setTitle] = useState(job.title), [caption, setCaption] = useState(job.caption), [description, setDescription] = useState(job.description ?? '');
  const [hashtags, setHashtags] = useState(job.hashtags.join(' '));
  const [schedule, setSchedule] = useState(job.scheduledAt ?? '');
  const [renderJobId, setRender] = useState(review.renders[0]?.id ?? '');
  const [connectionId, setConnection] = useState(job.connectionId ?? review.connections.find(c => c.platform === job.platform)?.id ?? '');
  const [visibility, setVisibility] = useState(job.visibility ?? '');
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState('');
  const decisions = useRef(new Map<string, string>());
  const refresh = async () => { await Promise.all([
    cache.invalidateQueries({ queryKey: ['publication', job.id] }), cache.invalidateQueries({ queryKey: ['publication-review', job.id] }), cache.invalidateQueries({ queryKey: ['publications'] }),
  ]); };
  const create = useMutation({ mutationFn: async () => {
    await publicationApi.updatePublicationDetails(job.id, { title, caption, description, hashtags: hashtags.trim() ? hashtags.trim().split(/\s+/) : [], scheduledAt: new Date(schedule).toISOString() });
    return publicationReviewApi.create(job.id, { renderJobId, connectionId, visibility });
  }, onSuccess: async m => { setSelectedId(m.manifestId); setMessage(`Created immutable revision ${m.revision}`); await refresh(); }, onError: () => { void refresh(); } });
  const decision = useMutation({ mutationFn: (action: 'APPROVE' | 'REJECT') => {
    if (!selected) throw new Error('Select a manifest');
    const key = `${selected.manifestId}:${action}`;
    if (!decisions.current.has(key)) decisions.current.set(key, crypto.randomUUID());
    return publicationReviewApi.decide(selected.manifestId, selected.fingerprint, action, decisions.current.get(key)!);
  }, onSuccess: async m => { setMessage(`Revision ${m.revision}: ${m.approval.state}`); await refresh(); } });
  const invalidate = useMutation({ mutationFn: () => publicationReviewApi.invalidate(job.id), onSuccess: async () => { setMessage('Approval invalidated. Create a new revision.'); await refresh(); } });
  const revoke = useMutation({ mutationFn: () => publicationReviewApi.revoke(selected!.manifestId), onSuccess: async () => { setMessage('Approval revoked'); await refresh(); } });
  const publish = useMutation({ mutationFn: () => publicationApi.publishNow(job.id), onSuccess: async result => {
    setMessage(result.status === 'PUBLISHED' && result.platformPostId ? `Provider confirmed post ${result.platformPostId}` : `${result.status}: waiting for provider confirmation`); await refresh();
  } });
  const busy = create.isPending || decision.isPending || invalidate.isPending || revoke.isPending || publish.isPending;
  const locked = ['PUBLISHING', 'PUBLISHED'].includes(job.status) || Boolean(job.reconciliationRequired) || Boolean(job.platformPostId) || Boolean(job.supersededBy);
  const current = selected?.manifestId === review.activeManifestId;
  const pending = selected?.approval.state === 'PENDING' && new Date(selected.approval.expiresAt).getTime() > Date.now();
  const dirty = Boolean(selected && (title !== selected.metadata.title || caption !== selected.metadata.caption || description !== selected.metadata.description
    || JSON.stringify(hashtags.trim() ? hashtags.trim().split(/\s+/) : []) !== JSON.stringify(selected.metadata.hashtags)
    || visibility !== selected.visibility || connectionId !== selected.connectionId || renderJobId !== selected.finalRenderJobId || Date.parse(schedule) !== Date.parse(selected.intendedSchedule ?? '')));
  const previous = selected && review.manifests.find(m => m.revision < selected.revision && m.approval.decisionActor != null && m.approval.state !== 'REJECTED');
  const inputClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500';
  return <>
    <section className="space-y-2 rounded-xl border border-zinc-800 p-4" aria-label="Upload readiness">
      <h2 className="font-semibold">{review.readiness.ready ? 'READY FOR GUARDED DISPATCH' : 'UPLOAD BLOCKED'}</h2>
      <p className="text-sm">{job.platform} · Job {job.id} · {job.status}</p>
      <p className="text-sm text-zinc-400">Real publish: {review.readiness.realPublishEnabled ? 'Enabled' : 'Disabled'} · Adapter: {review.readiness.adapterMode}</p>
      <ul className="text-sm text-amber-300">{review.readiness.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      <p className="text-sm">Reconciliation: {job.reconciliationRequired ? 'REQUIRED — upload is quarantined; do not retry' : 'Not required'}</p>
      {job.failureCategory && <p role="status" className="text-sm text-amber-300">{job.failureCategory}: {job.error}</p>}
      <Button variant="outline" onClick={() => void refresh()} disabled={busy}>Refresh readiness</Button>
    </section>
    {[create.error, decision.error, invalidate.error, revoke.error, publish.error].filter(Boolean).map((e, i) => <p key={i} role="alert" className="text-sm text-red-400">{(e as Error).message}</p>)}
    {message && <p role="status" className="text-sm text-blue-300">{message}</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-5"><Preview assetId={selected?.finalVideoAssetId ?? review.renders[0]?.outputAssetId} checksum={selected?.media.sha256} onVerified={setVerified} />
        <form className="space-y-4 rounded-xl border border-zinc-800 p-4" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
          <h2 className="font-semibold">Create immutable revision</h2>
          <p id="revision-help" className="text-sm text-zinc-400">Saving changes invalidates the previous approval. Choose the exact render, connection and visibility before creating a new manifest.</p>
          <fieldset disabled={locked || busy} className="space-y-4" aria-describedby="revision-help">
            <Input label="Publication title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={100} />
            <Textarea label="Caption" value={caption} onChange={e => setCaption(e.target.value)} maxLength={2000} />
            <Textarea label="Description" value={description} onChange={e => setDescription(e.target.value)} maxLength={3000} />
            <Input label="Hashtags (space separated)" value={hashtags} onChange={e => setHashtags(e.target.value)} />
            <Input label="Intended schedule (ISO with timezone)" value={schedule} onChange={e => setSchedule(e.target.value)} required />
            <label className="block space-y-1 text-sm">Final render<select className={inputClass} value={renderJobId} onChange={e => setRender(e.target.value)} required>
              <option value="">Choose successful render</option>{review.renders.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
            </select></label>
            <label className="block space-y-1 text-sm">Provider connection<select className={inputClass} value={connectionId} onChange={e => setConnection(e.target.value)} required>
              <option value="">Choose registered connection</option>{review.connections.filter(c => c.platform === job.platform).map(c => <option key={c.id} value={c.id}>{c.platform} · {c.id} · {c.status}</option>)}
            </select></label>
            <label className="block space-y-1 text-sm">Visibility<select className={inputClass} value={visibility} onChange={e => setVisibility(e.target.value)} required>
              <option value="">Choose explicitly</option><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
            </select></label>
            <Button type="submit" disabled={!renderJobId || !connectionId || !visibility}>Create manifest revision</Button>
          </fieldset>
          {locked && <p className="text-sm text-amber-300">Target is locked or requires reconciliation. Revisions cannot replace an in-flight or published target.</p>}
          {(!renderJobId || !connectionId) && <p className="text-sm text-amber-300">A successful render and registered connection reference are required.</p>}
        </form>
      </div>
      <section className="space-y-4 rounded-xl border border-zinc-800 p-4" aria-label="Immutable manifest review">
        <h2 className="font-semibold">Immutable manifest</h2>
        {!selected ? <p className="text-sm text-zinc-400">No manifest. Historical approved_at does not authorize publishing.</p> : <>
          <label className="block space-y-1 text-sm">Manifest revision<select className={inputClass} value={selected.manifestId} onChange={e => setSelectedId(e.target.value)}>
            {review.manifests.map(m => <option value={m.manifestId} key={m.manifestId}>Revision {m.revision} · {m.approval.state}{m.manifestId === review.activeManifestId ? ' · CURRENT' : ''}</option>)}
          </select></label>
          <p className="text-sm">{current ? 'CURRENT REVISION' : 'HISTORICAL — not eligible for approval or dispatch'}</p>
          <dl className="space-y-3 break-all text-sm">
            <div><dt className="text-zinc-400">Manifest / fingerprint</dt><dd>{selected.manifestId}<br />{selected.fingerprint}</dd></div>
            <div><dt className="text-zinc-400">Title</dt><dd>{selected.metadata.title}</dd></div>
            <div><dt className="text-zinc-400">Caption / description / hashtags</dt><dd className="whitespace-pre-wrap">{selected.metadata.providerDescription}</dd></div>
            <div><dt className="text-zinc-400">Target / connection revision</dt><dd>{selected.targetPlatform} · {selected.connectionId}<br />{selected.connectionRevision}</dd></div>
            <div><dt className="text-zinc-400">Visibility / intended schedule</dt><dd>{selected.visibility} · {dateLabel(selected.intendedSchedule)}</dd></div>
            <div><dt className="text-zinc-400">Video SHA-256 / size</dt><dd>{selected.media.sha256}<br />{selected.media.sizeBytes} bytes</dd></div>
            <div><dt className="text-zinc-400">Decode evidence</dt><dd>{selected.media.durationMillis / 1000}s · {selected.media.container} · {selected.media.codecs.map(c => `${c.type}:${c.codec}`).join(', ')}</dd></div>
            <div><dt className="text-zinc-400">Render / video asset / evidence</dt><dd>{selected.finalRenderJobId}<br />{selected.finalVideoAssetId}<br />{selected.evidenceId}</dd></div>
            <div><dt className="text-zinc-400">Created / approval expiry</dt><dd>{dateLabel(selected.createdAt)} · {dateLabel(selected.approval.expiresAt)}</dd></div>
            <div><dt className="text-zinc-400">Approval</dt><dd>{selected.approval.state} · {selected.approval.decisionActor ?? selected.approval.requiredOperator}</dd></div>
            <div><dt className="text-zinc-400">Provider options</dt><dd>Category {selected.providerSettings.categoryId} · Made for kids: {String(selected.providerSettings.selfDeclaredMadeForKids)} · Notify subscribers: {String(selected.providerSettings.notifySubscribers)}</dd></div>
          </dl>
          <h3 className="text-sm font-semibold">Changes since previous approval</h3>
          <ul className="list-inside list-disc text-sm text-zinc-300">{changes(selected, previous || undefined).map(change => <li key={change}>{change}</li>)}</ul>
          <details><summary className="cursor-pointer text-sm">Artifact provenance</summary><ul className="space-y-2 break-all text-xs text-zinc-400">{selected.artifactReferences.map(a => <li key={a.assetId}>{a.type} · {a.assetId} · {a.sha256}</li>)}</ul></details>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => decision.mutate('APPROVE')} disabled={busy || locked || !current || !pending || !verified || dirty}>Approve exact revision</Button>
            <Button variant="outline" onClick={() => decision.mutate('REJECT')} disabled={busy || locked || !current || !pending}>Reject exact revision</Button>
            <Button variant="outline" onClick={() => revoke.mutate()} disabled={busy || !current || selected.approval.state !== 'APPROVED'}>Revoke approval</Button>
            <Button variant="outline" onClick={() => invalidate.mutate()} disabled={busy || locked || !review.activeManifestId}>Invalidate approval</Button>
          </div>
          {(dirty || !verified) && <p className="text-sm text-amber-300">Approval needs unchanged revision fields and a matching video preview checksum.</p>}
          <p className="text-sm text-zinc-400">Approval expires within 30 minutes. P3 fixture approvals cannot authorize this publication.</p>
        </>}
        <Button variant="brand" onClick={() => publish.mutate()} disabled={busy || !review.readiness.ready || locked || !current || dirty}>Publish approved revision</Button>
      </section>
    </div>
    <section className="space-y-2" aria-label="Publication audit"><h2 className="font-semibold">Audit and failures</h2>
      <ul className="space-y-2 text-sm">{review.audit.map(e => <li key={e.id} className="break-all rounded-lg border border-zinc-800 p-3">{dateLabel(e.createdAt)} · {e.type} · {e.actor} · {e.manifestId ?? 'No manifest'}</li>)}</ul>
    </section>
  </>;
}
