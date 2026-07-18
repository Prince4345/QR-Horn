/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import IncomingCallModal from './components/IncomingCallModal';
import IncomingChatModal from './components/IncomingChatModal';
import ViewLoader from './components/ViewLoader';
import { LayoutDashboard, MessageSquare, Moon, QrCode, Sun } from 'lucide-react';
import { parseScanCodeFromPath } from './lib/scanUrl';
import BrandLogo from './components/BrandLogo';
import { useAuth } from './context/AuthContext';
import { useChat } from './context/ChatContext';
import { useTheme } from './context/ThemeContext';

const ScannerView = lazy(() => import('./components/ScannerView'));
const Dashboard = lazy(() => import('./components/Dashboard'));

function getInitialState() {
  const code = parseScanCodeFromPath(window.location.pathname);
  const params = new URLSearchParams(window.location.search);
  const chat = params.get('chat');
  const wantsDashboard = !code && params.get('view') === 'dashboard';
  const wantsMessages = wantsDashboard && (!!chat || params.get('tab') === 'messages');
  return {
    scanCode: code ?? undefined,
    view: (wantsDashboard ? 'dashboard' : 'scanner') as 'scanner' | 'dashboard',
    chatSessionId: chat ?? undefined,
    dashboardTab: (wantsMessages ? 'messages' : 'overview') as 'overview' | 'messages',
  };
}

function AppNav() {
  const { owner } = useAuth();
  const { unreadCount } = useChat();
  const { theme, toggleTheme } = useTheme();
  const initial = getInitialState();
  const [view, setView] = useState<'scanner' | 'dashboard'>(initial.view);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'messages'>(initial.dashboardTab);
  const [dashboardChatId, setDashboardChatId] = useState<string | undefined>(initial.chatSessionId);
  const [scanCode, setScanCode] = useState<string | undefined>(initial.scanCode);

  const syncFromUrl = useCallback(() => {
    const code = parseScanCodeFromPath(window.location.pathname);
    const params = new URLSearchParams(window.location.search);
    const chat = params.get('chat');

    if (code) {
      setScanCode(code);
      setView('scanner');
    } else {
      setScanCode(undefined);
    }

    if (chat && params.get('view') === 'dashboard') {
      setDashboardChatId(chat);
      setDashboardTab('messages');
      setView('dashboard');
    } else if (chat && (code || params.get('view') === 'scanner')) {
      setView('scanner');
      if (code) setScanCode(code);
    } else if (chat) {
      setView('scanner');
    } else if (params.get('view') === 'dashboard') {
      setView('dashboard');
      if (params.get('tab') === 'messages') setDashboardTab('messages');
    }
  }, []);

  useEffect(() => {
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [syncFromUrl]);

  useEffect(() => {
    const onOpenChat = (event: Event) => {
      const sessionId = (event as CustomEvent<{ sessionId: string }>).detail?.sessionId;
      if (!sessionId) return;
      setView('dashboard');
      setScanCode(undefined);
      setDashboardTab('messages');
      setDashboardChatId(sessionId);
    };
    window.addEventListener('qrhorn:open-chat', onOpenChat);
    return () => window.removeEventListener('qrhorn:open-chat', onOpenChat);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'qrhorn:open-dashboard') return;
      setView('dashboard');
      setScanCode(undefined);
      const url = event.data?.url as string | undefined;
      if (url) {
        const parsed = url.startsWith('http') ? new URL(url) : new URL(url, window.location.origin);
        window.history.replaceState(null, '', parsed.pathname + parsed.search);
        const chat = parsed.searchParams.get('chat');
        if (chat) {
          setDashboardChatId(chat);
          setDashboardTab('messages');
          window.dispatchEvent(new CustomEvent('qrhorn:incoming-chat'));
          return;
        }
      }
      window.dispatchEvent(new CustomEvent('qrhorn:incoming-call'));
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, []);

  const openScanner = () => {
    setView('scanner');
    if (!parseScanCodeFromPath(window.location.pathname)) {
      setScanCode(undefined);
      window.history.pushState(null, '', '/');
    }
  };

  const openDashboard = () => {
    setView('dashboard');
    setScanCode(undefined);
    setDashboardTab('overview');
    window.history.pushState(null, '', '/?view=dashboard');
  };

  const openMessages = () => {
    setView('dashboard');
    setScanCode(undefined);
    setDashboardTab('messages');
    window.history.pushState(null, '', '/?view=dashboard&tab=messages');
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none pt-[max(1rem,env(safe-area-inset-top))] px-3">
        <div className="bg-surface border border-line shadow-[0_8px_30px_rgba(26,26,26,0.06)] dark:shadow-[0_8px_30px_rgba(255,0,127,0.12)] p-1 rounded-full flex gap-0.5 sm:gap-1 pointer-events-auto max-w-full items-center">
          <BrandLogo size="sm" className="ml-1.5 mr-0.5 shrink-0" />
          <button
            onClick={openScanner}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold uppercase tracking-wide flex items-center gap-1.5 sm:gap-2 transition-colors shrink-0 ${
              view === 'scanner' ? 'bg-brand text-white shadow-md shadow-brand/30' : 'text-muted hover:text-ink'
            }`}
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">Scan</span>
            <span className="hidden sm:inline">Scanner</span>
          </button>
          {owner && (
            <button
              onClick={openMessages}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold uppercase tracking-wide flex items-center gap-1.5 sm:gap-2 transition-colors shrink-0 relative ${
                view === 'dashboard' && dashboardTab === 'messages'
                  ? 'bg-brand text-white shadow-md shadow-brand/30'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Chat</span>
              <span className="hidden sm:inline">Messages</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={openDashboard}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold uppercase tracking-wide flex items-center gap-1.5 sm:gap-2 transition-colors shrink-0 ${
              view === 'dashboard' && dashboardTab !== 'messages'
                ? 'bg-brand text-white shadow-md shadow-brand/30'
                : 'text-muted hover:text-ink'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">Owner</span>
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            className="mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-soft hover:text-ink sm:h-9 sm:w-9"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-accent" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <main
        className={`relative z-10 pb-[calc(1rem+env(safe-area-inset-bottom))] min-h-dvh flex flex-col w-full ${
          view === 'scanner'
            ? 'px-0 items-stretch pt-0'
            : view === 'dashboard' && dashboardTab === 'messages'
              ? 'px-0 sm:px-4 items-stretch pt-[calc(4.5rem+env(safe-area-inset-top))]'
              : 'px-2 sm:px-4 items-center pt-[calc(4.5rem+env(safe-area-inset-top))]'
        }`}
      >
        {view === 'scanner' ? (
          <div className="w-full flex flex-col items-stretch">
            <Suspense fallback={<ViewLoader />}>
              <ScannerView scanCode={scanCode} onOpenJoin={openDashboard} />
            </Suspense>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            <Suspense fallback={<ViewLoader />}>
              <Dashboard
                isActive={view === 'dashboard'}
                openChatSessionId={dashboardChatId}
                initialTab={dashboardTab}
                onTabChange={setDashboardTab}
              />
            </Suspense>
          </div>
        )}
      </main>
      <IncomingCallModal />
      <IncomingChatModal />
    </>
  );
}

export default function App() {
  return (
    <div className="min-h-dvh bg-canvas text-ink font-sans selection:bg-brand/15 overflow-x-hidden relative flex flex-col bg-gradient-to-b from-blush/40 via-canvas to-canvas dark:from-blush/80 dark:via-canvas dark:to-canvas">
      <AppNav />
    </div>
  );
}
