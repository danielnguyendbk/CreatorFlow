import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { Modal, Button, Input, Select } from '@/components/ui';
import { useGenerateIdeas } from './useIdeas';
import { notify } from '@/stores/notificationStore';

const schema = z.object({
  niche: z.string().min(1, 'Niche is required'),
  language: z.string().min(1, 'Language is required'),
  count: z.coerce.number().int().min(1).max(20),
  targetDurationSec: z.coerce.number().int().min(15).max(600),
  style: z.string().min(1, 'Style is required'),
});

type FormValues = z.infer<typeof schema>;

const NICHE_OPTIONS = [
  { value: 'Java Backend', label: 'Java Backend' },
  { value: 'System Design', label: 'System Design' },
  { value: 'AI Engineering', label: 'AI Engineering' },
  { value: 'Database', label: 'Database' },
  { value: 'DevOps', label: 'DevOps' },
  { value: 'Frontend', label: 'Frontend' },
  { value: 'Cloud', label: 'Cloud' },
];

const STYLE_OPTIONS = [
  { value: 'explainer', label: 'Explainer — deep technical breakdown' },
  { value: 'tutorial', label: 'Tutorial — step-by-step how-to' },
  { value: 'comparison', label: 'Comparison — A vs B analysis' },
  { value: 'story', label: 'Story — narrative with problem/solution arc' },
  { value: 'short_form', label: 'Short form — quick concept in 60s' },
];

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Vietnamese' },
];

interface GenerateIdeasModalProps {
  open: boolean;
  onClose: () => void;
}

export function GenerateIdeasModal({ open, onClose }: GenerateIdeasModalProps) {
  const { mutateAsync, isPending, isSuccess, reset } = useGenerateIdeas();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      niche: 'Java Backend',
      language: 'en',
      count: 5,
      targetDurationSec: 60,
      style: 'explainer',
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      const generated = await mutateAsync(values);
      notify.success(
        `${generated.length} ideas generated`,
        `Added to your backlog from niche "${values.niche}"`,
      );
      setTimeout(() => {
        reset();
        onClose();
      }, 1200);
    } catch {
      notify.error('Generation failed', 'Could not generate ideas. Try again.');
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Generate Ideas"
      description="Use AI to generate content ideas for your niche"
      size="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="brand"
            size="sm"
            leftIcon={isPending ? undefined : Sparkles}
            isLoading={isPending}
            onClick={handleSubmit(onSubmit)}
            id="generate-ideas-submit-btn"
          >
            {isSuccess ? 'Generated!' : 'Generate Ideas'}
          </Button>
        </>
      }
    >
      {isSuccess ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950 ring-1 ring-emerald-800">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-zinc-200">Ideas generated successfully!</p>
          <p className="text-xs text-zinc-500">Check your backlog to review them.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Select
            label="Niche"
            options={NICHE_OPTIONS}
            error={errors.niche?.message}
            {...register('niche')}
            id="generate-niche"
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Language"
              options={LANGUAGE_OPTIONS}
              error={errors.language?.message}
              {...register('language')}
              id="generate-language"
            />
            <Input
              label="Number of ideas"
              type="number"
              min={1}
              max={20}
              error={errors.count?.message}
              hint="1–20"
              {...register('count')}
              id="generate-count"
            />
          </div>

          <Input
            label="Target duration (seconds)"
            type="number"
            min={15}
            max={600}
            error={errors.targetDurationSec?.message}
            hint="e.g. 60 for 1 minute short-form"
            {...register('targetDurationSec')}
            id="generate-duration"
          />

          <Select
            label="Content style"
            options={STYLE_OPTIONS}
            error={errors.style?.message}
            {...register('style')}
            id="generate-style"
          />

          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-600">
              Ideas will be generated using Gemini and added to your backlog with{' '}
              <span className="text-zinc-400">NEW</span> status. Generation takes ~1.5 seconds with
              mock data.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
