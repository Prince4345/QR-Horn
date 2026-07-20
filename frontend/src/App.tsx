/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import IncomingCallModal from './components/IncomingCallModal';
import IncomingChatModal from './components/IncomingChatModal';
import ViewLoader from './components/ViewLoader';
import { LayoutDashboard, LogIn, MessageSquare, Moon, QrCode, Sun } from 'lucide-react';
import { parseScanCodeFromPath } from './lib/scanUrl';
import { APP_NAME } from './lib/brand';
import BrandLogo from './components/BrandLogo';
import BrandWordmark from './components/BrandWordmark';
import { useAuth } from './context/AuthContext';
import { useChat } from './context/ChatContext';
import { useTheme } from './context/ThemeContext';
import { bindNativeIntentHandler } from './lib/nativeAuthBridge';

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
  const { owner, session, setupComplete } = useAuth();
  const { unreadCount } = useChat();
  const { theme, toggleTheme } = useTheme();
  const isLoggedIn = Boolean(session && setupComplete && owner);
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

  // Android notification Answer / open / pending-reply deep links
  useEffect(() => {
    return bindNativeIntentHandler((detail) => {
      if (detail.url) {
        window.history.replaceState(null, '', detail.url);
      }
      if (detail.kind === 'chat' || detail.sessionId) {
        const sessionId = detail.sessionId || null;
        if (sessionId) {
          setView('dashboard');
          setScanCode(undefined);
          setDashboardTab('messages');
          setDashboardChatId(sessionId);
          window.dispatchEvent(
            new CustomEvent('qrhorn:open-chat', { detail: { sessionId } }),
          );
          if (detail.pendingReply?.trim()) {
            window.dispatchEvent(
              new CustomEvent('parkstag:pending-reply', {
                detail: { sessionId, body: detail.pendingReply.trim() },
              }),
            );
          }
        }
        return;
      }
      if (detail.kind === 'call' || detail.roomId) {
        setView('dashboard');
        setScanCode(undefined);
        window.dispatchEvent(new CustomEvent('qrhorn:incoming-call'));
      }
    });
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

  const openSignIn = () => {
    openDashboard();
  };

  const navLink = (active: boolean) =>
    `px-3 py-2 text-sm font-medium transition-colors ${
      active ? 'text-brand' : 'text-muted hover:text-ink'
    }`;

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-surface/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 sm:h-[4.5rem] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={openScanner}
            className="flex min-w-0 items-center gap-2.5 sm:gap-3 group"
            aria-label={`${APP_NAME} home`}
          >
            <BrandLogo size="nav" glow className="transition-transform group-hover:scale-[1.02]" />
            <BrandWordmark size="sm" className="group-hover:opacity-90 transition-opacity text-[1.5rem] sm:text-[1.875rem]" />
          </button>

          <nav className="flex items-center gap-0.5 sm:gap-1">
            <button type="button" onClick={openScanner} className={navLink(view === 'scanner')}>
              <span className="inline-flex items-center gap-1.5">
                <QrCode className="h-4 w-4" />
                <span className="hidden sm:inline">Scan</span>
              </span>
            </button>

            {isLoggedIn ? (
              <>
                <button
                  type="button"
                  onClick={openMessages}
                  className={`${navLink(view === 'dashboard' && dashboardTab === 'messages')} relative`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4" />
                    <span className="hidden sm:inline">Messages</span>
                  </span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={openDashboard}
                  className={navLink(view === 'dashboard' && dashboardTab !== 'messages')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={openSignIn}
                className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand/25 hover:bg-brand-dark transition-colors"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-soft hover:text-ink"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-accent" /> : <Moon className="h-4 w-4" />}
            </button>
          </nav>
        </div>
      </header>

      <main
        className={`relative z-10 pb-[calc(1rem+env(safe-area-inset-bottom))] min-h-[calc(100dvh-4rem)] sm:min-h-[calc(100dvh-4.5rem)] flex flex-col w-full ${
          view === 'scanner' ? 'px-0 items-stretch' : 'px-0 items-stretch'
        }`}
      >
        {view === 'scanner' ? (
          <div className="w-full flex flex-col items-stretch">
            <Suspense fallback={<ViewLoader />}>
              <ScannerView scanCode={scanCode} onOpenJoin={openSignIn} />
            </Suspense>
          </div>
        ) : (
          <div className="w-full flex flex-col items-stretch">
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
