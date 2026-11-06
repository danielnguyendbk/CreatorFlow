import type { PublicationManifest, PublicationReview } from '@/types';
import { apiRequest, realApi } from './_http';

function backend() { if (!realApi) throw new Error('Publication review requires the real backend.'); }
export const publicationReviewApi = {
  get: (id: string) => { backend(); return apiRequest<PublicationReview>(`/api/v2/publication-review/jobs/${encodeURIComponent(id)}`); },
  create: (id: string, input: { renderJobId: string; connectionId: string; visibility: string }) => {
    backend(); return apiRequest<PublicationManifest>(`/api/v2/publication-review/jobs/${encodeURIComponent(id)}/manifests`, { method: 'POST', body: JSON.stringify(input) });
  },
  decide: (id: string, fingerprint: string, decision: 'APPROVE' | 'REJECT', requestId: string) => {
    backend(); return apiRequest<PublicationManifest>(`/api/v2/publication-review/manifests/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ fingerprint, decision, requestId, expiresMinutes: 30 }) });
  },
  revoke: (id: string) => { backend(); return apiRequest<PublicationManifest>(`/api/v2/publication-review/manifests/${encodeURIComponent(id)}/revoke`, { method: 'POST' }); },
  invalidate: (id: string) => { backend(); return apiRequest<PublicationReview>(`/api/v2/publication-review/jobs/${encodeURIComponent(id)}/invalidate`, { method: 'POST' }); },
};
