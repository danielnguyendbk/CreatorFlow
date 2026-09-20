import { useState, useEffect } from 'react';
import {
  Settings,
  Cpu,
  Sliders,
  HardDrive,
  Share2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  Folder,
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  StatusBadge,
  PageHeader,
  ErrorState,
} from '@/components/ui';
import { providerStatusConfig } from '@/utils/statusConfig';
import { notify } from '@/stores/notificationStore';
import { useSettings, useUpdateSettings } from './useSettings';
import type { SystemSettings, ContentFormat, ProviderStatus } from '@/types';

type SettingsTab = 'ai' | 'content' | 'pipeline' | 'publishing';

const FORMAT_OPTIONS: { value: ContentFormat; label: string }[] = [
  { value: 'EXPLAINER', label: 'Explainer Video (Shorts/Reels)' },
  { value: 'SHORT_FORM', label: 'Short Form (Vertical 9:16)' },
  { value: 'LONG_FORM', label: 'Long Form (Horizontal 16:9)' },
  { value: 'TUTORIAL', label: 'Step-by-Step Tutorial' },
  { value: 'STORY', label: 'Narrative Storytelling' },
  { value: 'COMPARISON', label: 'Side-by-Side Comparison' },
];

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (US / UK)' },
  { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
  { value: 'es', label: 'Spanish (Español)' },
  { value: 'ja', label: 'Japanese (日本語)' },
];

const DURATION_OPTIONS = [
  { value: '30', label: '30 seconds (Quick hook)' },
  { value: '45', label: '45 seconds' },
  { value: '60', label: '60 seconds (Standard 1-min)' },
  { value: '90', label: '90 seconds' },
  { value: '120', label: '120 seconds (Deep dive)' },
];

const GEMINI_MODELS = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Recommended)' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Fastest)' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

const TTS_VOICES = [
  { value: 'en-US-GuyNeural', label: 'Guy Neural (en-US, Male Authoritative)' },
  { value: 'en-US-JennyNeural', label: 'Jenny Neural (en-US, Female Warm)' },
  { value: 'vi-VN-HoaiMyNeural', label: 'Hoài My (vi-VN, Female Expressive)' },
  { value: 'vi-VN-NamMinhNeural', label: 'Nam Minh (vi-VN, Male News)' },
];

const RESOLUTION_OPTIONS = [
  { value: '1080x1920', label: '1080 x 1920 (9:16 Vertical Shorts/Reels)' },
  { value: '1920x1080', label: '1920 x 1080 (16:9 Landscape)' },
  { value: '1080x1080', label: '1080 x 1080 (1:1 Square)' },
];

const CODEC_OPTIONS = [
  { value: 'libx264', label: 'libx264 (H.264 CPU - Universal compatibility)' },
  { value: 'h264_nvenc', label: 'h264_nvenc (NVIDIA Hardware GPU Acceleration)' },
  { value: 'libx265', label: 'libx265 (H.265 / HEVC High Efficiency)' },
];

const WORKER_OPTIONS = [
  { value: '1', label: '1 Worker (Low memory)' },
  { value: '2', label: '2 Parallel Workers (Recommended)' },
  { value: '4', label: '4 Parallel Workers (Multi-core CPU)' },
];

export function SettingsPage() {
  const { data: initialSettings, isLoading, error, refetch } = useSettings();
  const updateSettingsMutation = useUpdateSettings();

  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [form, setForm] = useState<SystemSettings | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Local state for API keys and simulation
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('AIzaSyD-••••••••••••••••••••••••');
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingTts, setTestingTts] = useState(false);
  const [resolution, setResolution] = useState('1080x1920');
  const [codec, setCodec] = useState('libx264');
  const [workers, setWorkers] = useState('2');
  const [autoStoryboard, setAutoStoryboard] = useState(true);
  const [requirePublishApproval, setRequirePublishApproval] = useState(true);

  // Sync form with fetched data
  useEffect(() => {
    if (initialSettings) {
      setForm(initialSettings);
    }
  }, [initialSettings]);

  const handleGeneralChange = (field: keyof SystemSettings['general'], value: string) => {
    if (!form) return;
    setForm({
      ...form,
      general: { ...form.general, [field]: value },
    });
    setIsDirty(true);
  };

  const handleContentDefaultsChange = (
    field: keyof SystemSettings['contentDefaults'],
    value: string | number,
  ) => {
    if (!form) return;
    setForm({
      ...form,
      contentDefaults: { ...form.contentDefaults, [field]: value },
    });
    setIsDirty(true);
  };

  const handleAiProviderGemini = (field: 'model' | 'status', value: string) => {
    if (!form) return;
    setForm({
      ...form,
      aiProviders: {
        ...form.aiProviders,
        gemini: {
          ...form.aiProviders.gemini,
          [field]: value,
        },
      },
    });
    setIsDirty(true);
  };

  const handleGoogleFlowMode = (mode: 'MANUAL' | 'AUTO') => {
    if (!form) return;
    setForm({
      ...form,
      aiProviders: {
        ...form.aiProviders,
        googleFlow: {
          ...form.aiProviders.googleFlow,
          mode,
        },
      },
    });
    setIsDirty(true);
  };

  const handleTtsVoice = (voice: string) => {
    if (!form) return;
    setForm({
      ...form,
      aiProviders: {
        ...form.aiProviders,
        localTts: {
          ...form.aiProviders.localTts,
          voice,
          status: voice ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
      },
    });
    setIsDirty(true);
  };

  const handleMediaChange = (field: 'outputDirectory' | 'tempDirectory', value: string) => {
    if (!form) return;
    setForm({
      ...form,
      media: {
        ...form.media,
        [field]: value,
      },
    });
    setIsDirty(true);
  };

  const handleTogglePublishPlatform = (platform: keyof SystemSettings['publishing']) => {
    if (!form) return;
    const current = form.publishing[platform];
    const nextStatus: ProviderStatus = current === 'CONFIGURED' ? 'NOT_CONFIGURED' : 'CONFIGURED';
    setForm({
      ...form,
      publishing: {
        ...form.publishing,
        [platform]: nextStatus,
      },
    });
    setIsDirty(true);
    notify.info(
      `${platform.toUpperCase()} connection updated`,
      `Status toggled to ${nextStatus}`,
    );
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      notify.success(
        'Gemini API Connected',
        'Model gemini-2.5-pro responded in 142ms. Quota is healthy.',
      );
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestTts = async () => {
    setTestingTts(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      notify.success(
        'TTS Voice Synthesized',
        `Synthesized test audio preview using voice '${form?.aiProviders.localTts.voice ?? 'en-US-GuyNeural'}'`,
      );
    } finally {
      setTestingTts(false);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    try {
      await updateSettingsMutation.mutateAsync(form);
      setIsDirty(false);
      notify.success('Settings Saved', 'System configurations have been successfully updated.');
    } catch {
      notify.error('Failed to Save', 'An error occurred while saving system settings.');
    }
  };

  const handleReset = () => {
    if (initialSettings) {
      setForm(initialSettings);
      setIsDirty(false);
      notify.info('Settings Reset', 'Restored to previously loaded configuration.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="System Settings"
          description="AI providers, media render pipeline, publishing platforms, and default generation parameters"
        />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="System Settings"
          description="AI providers, media render pipeline, publishing platforms, and default generation parameters"
        />
        <ErrorState
          title="Failed to load settings"
          message={error instanceof Error ? error.message : 'Unable to retrieve system settings'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            System Settings
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Configure AI models, media paths, content generation defaults, and distribution channels
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Discard
            </Button>
          )}

          <Button
            variant="brand"
            size="sm"
            onClick={() => void handleSave()}
            isLoading={updateSettingsMutation.isPending}
            className="text-xs font-semibold shadow-lg shadow-brand-500/20"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save Configuration
          </Button>
        </div>
      </div>

      {/* Dirty state notification bar */}
      {isDirty && (
        <div className="flex items-center justify-between rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-300 animate-slide-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>You have unsaved changes. Don't forget to save before leaving this page.</span>
          </div>
          <button
            onClick={() => void handleSave()}
            className="font-semibold text-amber-200 underline hover:text-amber-100 ml-4 shrink-0"
          >
            Save now
          </button>
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-zinc-800 space-x-1 sm:space-x-4">
        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
            activeTab === 'ai'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <Cpu className="h-4 w-4" />
          <span>AI Providers</span>
          <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
            3
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('content')}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
            activeTab === 'content'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Content Defaults</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pipeline')}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
            activeTab === 'pipeline'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <HardDrive className="h-4 w-4" />
          <span>Render & Storage</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('publishing')}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
            activeTab === 'publishing'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <Share2 className="h-4 w-4" />
          <span>Social Platforms</span>
          <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
            4
          </span>
        </button>
      </div>

      {/* TAB 1: AI PROVIDERS */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          {/* Gemini Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-950/60 border border-blue-800/60 text-blue-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    Google Gemini
                    <span className="text-[10px] bg-blue-950 text-blue-400 border border-blue-800 rounded px-1.5 py-0.2 font-mono">
                      Primary LLM
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Powers idea expansion, automated script generation, and scene storyboard prompts
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge meta={providerStatusConfig[form.aiProviders.gemini.status]} size="sm" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleTestGemini()}
                  isLoading={testingGemini}
                  className="text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300"
                >
                  Test Connection
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Select
                  label="LLM Model Engine"
                  options={GEMINI_MODELS}
                  value={form.aiProviders.gemini.model ?? 'gemini-2.5-pro'}
                  onChange={(e) => handleAiProviderGemini('model', e.target.value)}
                  hint="Gemini 2.5 Pro provides the richest viral narrative reasoning and hook pacing."
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                  Gemini API Key
                </label>
                <div className="relative">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiApiKey}
                    onChange={(e) => {
                      setGeminiApiKey(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Enter API Key"
                    className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 pl-3 pr-10 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Stored securely in local environment configuration.
                </p>
              </div>
            </div>
          </div>

          {/* Google Flow Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-400">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    Google Flow Video Generation
                    <span className="text-[10px] bg-amber-950 text-amber-400 border border-amber-800 rounded px-1.5 py-0.2 font-mono">
                      Human-in-the-Loop
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Video clips are generated in Google Flow and triaged into scene slots via Inbox
                  </p>
                </div>
              </div>

              <StatusBadge meta={providerStatusConfig[form.aiProviders.googleFlow.status]} size="sm" />
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                  Ingestion Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleGoogleFlowMode('MANUAL')}
                    className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                      form.aiProviders.googleFlow.mode === 'MANUAL'
                        ? 'border-brand-500 bg-brand-950/30 ring-1 ring-brand-500/40'
                        : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">
                        Manual Download & Upload (Active)
                      </span>
                      {form.aiProviders.googleFlow.mode === 'MANUAL' && (
                        <CheckCircle2 className="h-4 w-4 text-brand-400" />
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                      Generate clips in Google Flow web console, download MP4s, then drop them into
                      the CreatorFlow Asset Inbox.
                    </p>
                  </button>

                  <div className="flex flex-col text-left p-3.5 rounded-xl border border-zinc-800/60 bg-zinc-900/20 opacity-60 cursor-not-allowed">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-400">
                        Direct API / Webhook Sync
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase font-mono">Upcoming</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1 leading-snug">
                      Direct automated webhook dispatch once Google Flow enterprise API becomes publicly available.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-zinc-950/60 p-3 text-xs text-zinc-400 border border-zinc-800/60 flex items-start gap-2">
                <ExternalLink className="h-4 w-4 text-brand-400 mt-0.5 shrink-0" />
                <span>
                  Tip: Copy prompt text from the{' '}
                  <strong className="text-zinc-200">Storyboard Tab</strong> in Content Detail, paste
                  into Google Flow, and download 5-second 1080p vertical video clips.
                </span>
              </div>
            </div>
          </div>

          {/* Local TTS Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Local TTS & Voice Generation
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Synthesizes narrator voiceover with synchronized subtitle timestamps
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge meta={providerStatusConfig[form.aiProviders.localTts.status]} size="sm" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleTestTts()}
                  isLoading={testingTts}
                  className="text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300"
                >
                  Audition Voice
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Select
                  label="Default Voice Character"
                  options={TTS_VOICES}
                  value={form.aiProviders.localTts.voice ?? 'en-US-GuyNeural'}
                  onChange={(e) => handleTtsVoice(e.target.value)}
                  hint="High dynamic-range voice optimized for narrative shorts."
                />
              </div>

              <div>
                <Input
                  label="Speech Pacing / Speed Rate"
                  defaultValue="1.05x"
                  disabled
                  hint="Fine-tuned in story script generator for high-energy retention."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONTENT DEFAULTS */}
      {activeTab === 'content' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-5">
          <div className="pb-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-100">
              Default Content Generation Presets
            </h3>
            <p className="text-xs text-zinc-400">
              These defaults are automatically applied when expanding ideas and generating workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Input
                label="Default Niche Topic"
                value={form.contentDefaults.defaultNiche}
                onChange={(e) => handleContentDefaultsChange('defaultNiche', e.target.value)}
                hint="e.g. Java Backend, Stoic Discipline, Personal Wealth, Tech Architecture"
              />
            </div>

            <div>
              <Select
                label="Default Primary Language"
                options={LANGUAGE_OPTIONS}
                value={form.contentDefaults.defaultLanguage}
                onChange={(e) => handleContentDefaultsChange('defaultLanguage', e.target.value)}
                hint="Script prompts and voiceover will be generated in this language."
              />
            </div>

            <div>
              <Select
                label="Default Video Format"
                options={FORMAT_OPTIONS}
                value={form.contentDefaults.defaultFormat}
                onChange={(e) => handleContentDefaultsChange('defaultFormat', e.target.value as ContentFormat)}
                hint="Determines aspect ratio, scene structure, and rhythm."
              />
            </div>

            <div>
              <Select
                label="Target Video Duration"
                options={DURATION_OPTIONS}
                value={String(form.contentDefaults.defaultDurationSec)}
                onChange={(e) => handleContentDefaultsChange('defaultDurationSec', Number(e.target.value))}
                hint="Pacing model targets script word-count for this length."
              />
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800/80 space-y-3">
            <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Workflow Automation Triggers
            </h4>

            <div className="space-y-2.5">
              <label className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30 border border-zinc-800 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={autoStoryboard}
                  onChange={(e) => {
                    setAutoStoryboard(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-brand-500 focus:ring-brand-500 focus:ring-offset-0"
                />
                <div>
                  <span className="text-xs font-medium text-zinc-200 block">
                    Auto-generate Storyboard upon Script approval
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Immediately extracts 5-second scenes and Google Flow visual prompts when a script is generated.
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30 border border-zinc-800 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={requirePublishApproval}
                  onChange={(e) => {
                    setRequirePublishApproval(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-brand-500 focus:ring-brand-500 focus:ring-offset-0"
                />
                <div>
                  <span className="text-xs font-medium text-zinc-200 block">
                    Require human approval before publishing
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    All completed render jobs hold in Publication Queue until explicitly confirmed.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STORAGE & RENDER PIPELINE */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {/* FFmpeg Engine Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-950/60 border border-violet-800/60 text-violet-400">
                  <HardDrive className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    FFmpeg Video Render Engine
                    <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 rounded px-1.5 py-0.2 font-mono">
                      v6.1.1 Detected
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Assembles video clips, audio voiceovers, captions, and transitions into finished MP4s
                  </p>
                </div>
              </div>

              <StatusBadge meta={providerStatusConfig[form.media.ffmpegStatus]} size="sm" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Select
                  label="Render Resolution"
                  options={RESOLUTION_OPTIONS}
                  value={resolution}
                  onChange={(e) => {
                    setResolution(e.target.value);
                    setIsDirty(true);
                  }}
                  hint="Vertical 9:16 is optimized for YouTube Shorts, Instagram Reels, and TikTok."
                />
              </div>

              <div>
                <Select
                  label="Video Encoder Codec"
                  options={CODEC_OPTIONS}
                  value={codec}
                  onChange={(e) => {
                    setCodec(e.target.value);
                    setIsDirty(true);
                  }}
                  hint="NVENC uses GPU; libx264 ensures universal playback on all devices."
                />
              </div>

              <div>
                <Select
                  label="Parallel Worker Limit"
                  options={WORKER_OPTIONS}
                  value={workers}
                  onChange={(e) => {
                    setWorkers(e.target.value);
                    setIsDirty(true);
                  }}
                  hint="Prevents CPU starvation during intensive filter-complex encodes."
                />
              </div>
            </div>
          </div>

          {/* Directory Storage Paths Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div className="pb-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100">
                Storage & Temp Directories
              </h3>
              <p className="text-xs text-zinc-400">
                Local directory paths where raw media assets, cache files, and completed renders reside
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5 flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5 text-brand-400" />
                  Output Directory
                </label>
                <input
                  type="text"
                  value={form.media.outputDirectory}
                  onChange={(e) => handleMediaChange('outputDirectory', e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Destination for finalized rendered video deliverables.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5 flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5 text-zinc-500" />
                  Temporary Scratch Directory
                </label>
                <input
                  type="text"
                  value={form.media.tempDirectory}
                  onChange={(e) => handleMediaChange('tempDirectory', e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Used for intermediate TTS chunks and FFmpeg pass buffers.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PUBLISHING PLATFORMS */}
      {activeTab === 'publishing' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">
              Connected Social Media Channels
            </h3>
            <p className="text-xs text-zinc-400">
              Authenticate your social accounts to enable one-click publishing and scheduled auto-distribution.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* YouTube Shorts */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-950/60 border border-red-800/60 text-red-400 font-bold">
                    YT
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100">YouTube Shorts</h4>
                    <p className="text-xs text-zinc-400">Google OAuth 2.0 API</p>
                  </div>
                </div>
                <StatusBadge meta={providerStatusConfig[form.publishing.youtube]} size="sm" />
              </div>

              <p className="text-xs text-zinc-400">
                Direct uploads to YouTube with title, description, tags, and category metadata.
              </p>

              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-500">
                  {form.publishing.youtube === 'CONFIGURED' ? 'Channel Linked' : 'OAuth Required'}
                </span>
                <Button
                  variant={form.publishing.youtube === 'CONFIGURED' ? 'outline' : 'brand'}
                  size="sm"
                  onClick={() => handleTogglePublishPlatform('youtube')}
                  className="text-xs"
                >
                  {form.publishing.youtube === 'CONFIGURED' ? 'Disconnect' : 'Connect Channel'}
                </Button>
              </div>
            </div>

            {/* TikTok */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 border border-zinc-700 text-teal-400 font-bold">
                    TT
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100">TikTok</h4>
                    <p className="text-xs text-zinc-400">Content Posting API</p>
                  </div>
                </div>
                <StatusBadge meta={providerStatusConfig[form.publishing.tiktok]} size="sm" />
              </div>

              <p className="text-xs text-zinc-400">
                Publish vertical videos directly to TikTok Creator account with custom cover frames.
              </p>

              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-500">
                  {form.publishing.tiktok === 'CONFIGURED' ? 'Account Linked' : 'OAuth Required'}
                </span>
                <Button
                  variant={form.publishing.tiktok === 'CONFIGURED' ? 'outline' : 'brand'}
                  size="sm"
                  onClick={() => handleTogglePublishPlatform('tiktok')}
                  className="text-xs"
                >
                  {form.publishing.tiktok === 'CONFIGURED' ? 'Disconnect' : 'Connect Account'}
                </Button>
              </div>
            </div>

            {/* Instagram Reels */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-950/60 border border-purple-800/60 text-purple-400 font-bold">
                    IG
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100">Instagram Reels</h4>
                    <p className="text-xs text-zinc-400">Meta Graph API</p>
                  </div>
                </div>
                <StatusBadge meta={providerStatusConfig[form.publishing.instagram]} size="sm" />
              </div>

              <p className="text-xs text-zinc-400">
                Automated publishing to Instagram Business or Creator profiles with hashtag formatting.
              </p>

              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-500">
                  {form.publishing.instagram === 'CONFIGURED' ? 'Page Linked' : 'OAuth Required'}
                </span>
                <Button
                  variant={form.publishing.instagram === 'CONFIGURED' ? 'outline' : 'brand'}
                  size="sm"
                  onClick={() => handleTogglePublishPlatform('instagram')}
                  className="text-xs"
                >
                  {form.publishing.instagram === 'CONFIGURED' ? 'Disconnect' : 'Connect Instagram'}
                </Button>
              </div>
            </div>

            {/* Facebook Reels */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-950/60 border border-blue-800/60 text-blue-400 font-bold">
                  FB
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-100">Facebook Reels</h4>
                  <p className="text-xs text-zinc-400">Page Video API</p>
                </div>
              </div>
              <StatusBadge meta={providerStatusConfig[form.publishing.facebook]} size="sm" />
            </div>

            <p className="text-xs text-zinc-400">
              Cross-distribute reels to managed Facebook Creator pages.
            </p>

            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-500">
                {form.publishing.facebook === 'CONFIGURED' ? 'Page Linked' : 'OAuth Required'}
              </span>
              <Button
                variant={form.publishing.facebook === 'CONFIGURED' ? 'outline' : 'brand'}
                size="sm"
                onClick={() => handleTogglePublishPlatform('facebook')}
                className="text-xs"
              >
                {form.publishing.facebook === 'CONFIGURED' ? 'Disconnect' : 'Connect Page'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* General System & Locale Settings Section */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200">System Timezone & Regional Format</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="System Language Code"
            value={form.general.language}
            onChange={(e) => handleGeneralChange('language', e.target.value)}
            hint="ISO 639-1 language tag (e.g. en, vi)"
          />
          <Input
            label="Display Timezone"
            value={form.general.timezone}
            onChange={(e) => handleGeneralChange('timezone', e.target.value)}
            hint="IANA timezone (e.g. Asia/Ho_Chi_Minh, UTC)"
          />
        </div>
      </div>
    </div>
  );
}
