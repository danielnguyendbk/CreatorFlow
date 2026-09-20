import type { SystemSettings } from '@/types';

export const mockSettings: SystemSettings = {
  general: {
    language: 'en',
    timezone: 'Asia/Ho_Chi_Minh',
  },
  contentDefaults: {
    defaultNiche: 'Java Backend',
    defaultLanguage: 'en',
    defaultFormat: 'EXPLAINER',
    defaultDurationSec: 60,
  },
  aiProviders: {
    gemini: {
      name: 'Gemini',
      status: 'CONFIGURED',
      model: 'gemini-2.5-pro',
      note: null,
    },
    googleFlow: {
      mode: 'MANUAL',
      status: 'CONFIGURED',
    },
    localTts: {
      status: 'NOT_CONFIGURED',
      voice: null,
    },
  },
  media: {
    ffmpegStatus: 'CONFIGURED',
    outputDirectory: '/var/creatorflow/output',
    tempDirectory: '/var/creatorflow/temp',
  },
  publishing: {
    youtube: 'NOT_CONFIGURED',
    tiktok: 'NOT_CONFIGURED',
    instagram: 'NOT_CONFIGURED',
    facebook: 'NOT_CONFIGURED',
  },
};
