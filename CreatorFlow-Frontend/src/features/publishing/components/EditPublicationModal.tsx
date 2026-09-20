import { useState, useEffect } from 'react';
import { Modal, Button, Input, Textarea } from '@/components/ui';
import { notify } from '@/stores/notificationStore';
import { useUpdatePublicationDetails } from '../usePublishing';
import type { PublicationJob } from '@/types';

interface EditPublicationModalProps {
  open: boolean;
  onClose: () => void;
  publication: PublicationJob | null;
}

export function EditPublicationModal({
  open,
  onClose,
  publication,
}: EditPublicationModalProps) {
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtagsStr, setHashtagsStr] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const updateMutation = useUpdatePublicationDetails();

  useEffect(() => {
    if (publication) {
      setTitle(publication.title);
      setCaption(publication.caption);
      setHashtagsStr(publication.hashtags.join(', '));
      setScheduledAt(publication.scheduledAt ? publication.scheduledAt.slice(0, 16) : '');
    }
  }, [publication, open]);

  if (!publication) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const hashtags = hashtagsStr
      .split(',')
      .map((h) => h.trim().replace(/^#/, ''))
      .filter(Boolean);

    try {
      await updateMutation.mutateAsync({
        id: publication.id,
        updates: {
          title,
          caption,
          hashtags,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      });

      notify.success('Publication Updated', 'Changes saved successfully.');
      onClose();
    } catch (err) {
      notify.error('Update failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit Post — ${publication.platform.replace(/_/g, ' ')}`}
      description={`Update publication metadata for "${publication.contentTitle}"`}
      size="md"
    >
      <form onSubmit={handleSave} className="space-y-4">
        <Input
          label="Post Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <Textarea
          label="Caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          required
        />

        <Input
          label="Hashtags (comma-separated)"
          value={hashtagsStr}
          onChange={(e) => setHashtagsStr(e.target.value)}
          placeholder="SystemDesign, Backend, Tech"
        />

        <Input
          type="datetime-local"
          label="Scheduled Date & Time"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="brand" size="sm" isLoading={updateMutation.isPending}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
