import { useState, useRef } from 'react';
import { UploadCloud, FileVideo, AlertCircle, Loader2 } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { formatBytes } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import { useUploadSceneClip } from '../useContent';
import type { Scene } from '@/types';

interface UploadClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentId: string;
  storyboardId: string;
  scene: Scene | null;
}

export function UploadClipModal({
  isOpen,
  onClose,
  contentId,
  storyboardId,
  scene,
}: UploadClipModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useUploadSceneClip();

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

    // Validate video file
    if (!file.type.startsWith('video/') && !file.name.endsWith('.mp4') && !file.name.endsWith('.webm')) {
      setError('Please select a video file (MP4, WebM, MOV)');
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !scene) return;

    try {
      await uploadMutation.mutateAsync({
        file: selectedFile,
        contentId,
        storyboardId,
        sceneId: scene.id,
        onProgress: (pct) => setProgress(pct),
      });

      notify.success(
        `Clip uploaded for Scene ${scene.sceneNumber}`,
        `File ${selectedFile.name} successfully attached and processed.`,
      );
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  if (!scene) return null;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={`Upload Video Clip — Scene ${scene.sceneNumber}`}
      description="Upload an AI-generated clip from Google Flow or another generator."
      size="md"
    >
      <div className="space-y-4">
        {/* Scene Prompt Context */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
          <div className="font-medium text-zinc-300">Prompt for Scene {scene.sceneNumber}:</div>
          <p className="mt-1 font-mono text-zinc-400 text-[11px] leading-relaxed line-clamp-3">
            {scene.prompt}
          </p>
        </div>

        {/* Drag & Drop / File Select Box */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/40 p-6 text-center transition-colors hover:border-brand-500 hover:bg-zinc-900/80"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.webm,.mov"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploadMutation.isPending}
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 group-hover:bg-brand-500/10">
            <UploadCloud className="h-6 w-6 text-zinc-400 group-hover:text-brand-400" />
          </div>
          <div className="mt-3 text-sm font-medium text-zinc-200">
            {selectedFile ? selectedFile.name : 'Click to select video clip'}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {selectedFile
              ? `${formatBytes(selectedFile.size)} • Ready to upload`
              : 'Supports MP4, WebM, MOV up to 250MB'}
          </p>
        </div>

        {/* Selected file preview pill */}
        {selectedFile && !uploadMutation.isPending && (
          <div className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2 text-xs border border-zinc-800">
            <div className="flex items-center gap-2 truncate">
              <FileVideo className="h-4 w-4 text-brand-400 flex-shrink-0" />
              <span className="truncate text-zinc-300">{selectedFile.name}</span>
            </div>
            <span className="text-zinc-500 flex-shrink-0">{formatBytes(selectedFile.size)}</span>
          </div>
        )}

        {/* Progress Bar */}
        {uploadMutation.isPending && (
          <div className="space-y-2 rounded-lg border border-brand-500/20 bg-brand-950/20 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-brand-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Uploading & verifying clip...
              </span>
              <span className="font-mono text-brand-400">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-brand-500 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              Attaching to Scene {scene.sceneNumber} and checking format compliance.
            </p>
          </div>
        )}

        {/* Error message */}
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
            Upload Clip
          </Button>
        </div>
      </div>
    </Modal>
  );
}
