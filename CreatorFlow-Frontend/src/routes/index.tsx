import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { IdeasPage } from '@/features/ideas/IdeasPage';
import { ContentsPage } from '@/features/content/ContentsPage';
import { ContentDetailPage } from '@/features/content/ContentDetailPage';
import { AssetLibraryPage } from '@/features/assets/AssetLibraryPage';
import { AssetInboxPage } from '@/features/assets/AssetInboxPage';
import { WorkflowsPage } from '@/features/workflows/WorkflowsPage';
import { WorkflowDetailPage } from '@/features/workflows/WorkflowDetailPage';
import { RenderQueuePage } from '@/features/render/RenderQueuePage';
import { PublicationQueuePage } from '@/features/publishing/PublicationQueuePage';
import { PublicationReviewPage } from '@/features/publishing/PublicationReviewPage';
import { ActivityPage } from '@/features/activity/ActivityPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AccountManagerPage } from '@/features/accounts/AccountManagerPage';
import { AgentMonitoringPage } from '@/features/agents/AgentMonitoringPage';
import { AiUsagePage } from '@/features/usage/AiUsagePage';
import { TelegramIntegrationPage } from '@/features/telegram/TelegramIntegrationPage';
import { NotFoundPage } from '@/features/common/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'ideas',
        element: <IdeasPage />,
      },
      {
        path: 'contents',
        element: <ContentsPage />,
      },
      {
        path: 'contents/:id',
        element: <ContentDetailPage />,
      },
      {
        path: 'assets',
        element: <AssetLibraryPage />,
      },
      {
        path: 'assets/inbox',
        element: <AssetInboxPage />,
      },
      {
        path: 'workflows',
        element: <WorkflowsPage />,
      },
      {
        path: 'workflows/:id',
        element: <WorkflowDetailPage />,
      },
      {
        path: 'render-queue',
        element: <RenderQueuePage />,
      },
      {
        path: 'publication-queue',
        element: <PublicationQueuePage />,
      },
      { path: 'publication-jobs/:id/review', element: <PublicationReviewPage /> },
      {
        path: 'activity',
        element: <ActivityPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: 'accounts',
        element: <AccountManagerPage />,
      },
      {
        path: 'agents',
        element: <AgentMonitoringPage />,
      },
      {
        path: 'ai-usage',
        element: <AiUsagePage />,
      },
      { path: 'telegram', element: <TelegramIntegrationPage /> },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
