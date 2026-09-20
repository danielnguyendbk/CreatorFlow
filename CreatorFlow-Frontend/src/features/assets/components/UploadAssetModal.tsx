import { useState, useRef } from 'react';
import { UploadCloud, FileVideo, AlertCircle, Loader2 } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { formatBytes } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import { useUploadInboxAsset } from '../useAssets';

interface UploadAssetModalProps {
  open: boolean;
  onClose: () => void;
}

export function UploadAssetModal({ open, onClose }: UploadAssetModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useUploadInboxAsset();

  const handleClose = () => {
    if (uploadMutation.isPending) return;
    setSelectedFile(null);
    setProgress(0);
    setError(null);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await uploadMutation.mutateAsync({
        file: selectedFile,
        onProgress: (pct) => setProgress(pct),
      });

      notify.success(
        'Asset Uploaded to Library',
        `${selectedFile.name} is now available in your Asset Library and Inbox.`,
      );
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Upload Media Asset"
      description="Upload video clips, audio tracks, images, or subtitles to CreatorFlow."
      size="md"
    >
      <div className="space-y-4">
        {/* Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/40 p-6 text-center transition-colors hover:border-brand-500 hover:bg-zinc-900/80"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,image/*,.srt,.vtt"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploadMutation.isPending}
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 group-hover:bg-brand-500/10">
            <UploadCloud className="h-6 w-6 text-zinc-400 group-hover:text-brand-400" />
          </div>
          <div className="mt-3 text-sm font-medium text-zinc-200">
            {selectedFile ? selectedFile.name : 'Click or drop files here'}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {selectedFile
              ? `${formatBytes(selectedFile.size)} • Ready`
              : 'Supports MP4, MOV, MP3, PNG, JPG, SRT up to 500MB'}
          </p>
        </div>

        {/* Selected file preview */}
        {selectedFile && !uploadMutation.isPending && (
          <div className="flex items-center justify-between rounded-lg bg-zinc-950 px-3 py-2 text-xs border border-zinc-800">
            <div className="flex items-center gap-2 truncate">
              <FileVideo className="h-4 w-4 text-brand-400 flex-shrink-0" />
              <span className="truncate text-zinc-300">{selectedFile.name}</span>
            </div>
            <span className="text-zinc-500 flex-shrink-0">{formatBytes(selectedFile.size)}</span>
          </div>
        )}

        {/* Progress */}
        {uploadMutation.isPending && (
          <div className="space-y-2 rounded-lg border border-brand-500/20 bg-brand-950/20 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-brand-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Uploading & indexing asset...
              </span>
              <span className="font-mono text-brand-400">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-brand-500 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={uploadMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="brand"
            size="sm"
            onClick={() => void handleUpload()}
            disabled={!selectedFile || uploadMutation.isPending}
            isLoading={uploadMutation.isPending}
          >
            Upload Asset
          </Button>
        </div>
      </div>
    </Modal>
  );
}
