export const realApi = Boolean(import.meta.env.VITE_API_BASE_URL);

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('creatorflow_api_token');
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export function uploadRequest<T>(path: string, file: File, fields: Record<string, string>, onProgress?: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${import.meta.env.VITE_API_BASE_URL}${path}`);
    const token = sessionStorage.getItem('creatorflow_api_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round(100 * event.loaded / event.total)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText) as T);
      else reject(new Error(JSON.parse(xhr.responseText || '{}').error ?? `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });
}
