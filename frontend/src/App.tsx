/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import ScannerView from './components/ScannerView';
import Dashboard from './components/Dashboard';
import IncomingCallModal from './components/IncomingCallModal';
import IncomingChatModal from './components/IncomingChatModal';
import { LayoutDashboard, MessageSquare, QrCode } from 'lucide-react';
import { parseScanCodeFromPath } from './lib/scanUrl';
import { useAuth } from './context/AuthContext';
import { useChat } from './context/ChatContext';

function getInitialState() {
  const code = parseScanCodeFromPath(window.location.pathname);
  const params = new URLSearchParams(window.location.search);
  const chat = params.get('chat');
  const wantsDashboard = !code && (params.get('view') === 'dashboard' || !!chat);
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

    if (chat) {
      setDashboardChatId(chat);
      setDashboardTab('messages');
      setView('dashboard');
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
        <div className="bg-white/5 border border-white/10 backdrop-blur-md p-1 rounded-full flex gap-0.5 sm:gap-1 pointer-events-auto max-w-full">
          <button
            onClick={openScanner}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 transition-colors shrink-0 ${
              view === 'scanner' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">Scan</span>
            <span className="hidden sm:inline">Scanner</span>
          </button>
          {owner && (
            <button
              onClick={openMessages}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 transition-colors shrink-0 relative ${
                view === 'dashboard' && dashboardTab === 'messages'
                  ? 'bg-violet-600/30 text-violet-100'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Chat</span>
              <span className="hidden sm:inline">Messages</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={openDashboard}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 transition-colors shrink-0 ${
              view === 'dashboard' && dashboardTab !== 'messages'
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">Owner</span>
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </div>
      </div>

      <main
        className={`pt-[calc(4.5rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] min-h-dvh flex flex-col w-full ${
          view === 'dashboard' && dashboardTab === 'messages'
            ? 'px-0 sm:px-4 items-stretch'
            : 'px-2 sm:px-4 items-center'
        }`}
      >
        <div className={view === 'scanner' ? 'w-full max-w-6xl mx-auto flex flex-col items-center' : 'hidden'} aria-hidden={view !== 'scanner'}>
          <ScannerView scanCode={scanCode} />
        </div>
        <div className={view === 'dashboard' ? 'w-full flex flex-col items-center' : 'hidden'} aria-hidden={view !== 'dashboard'}>
          <Dashboard
            isActive={view === 'dashboard'}
            openChatSessionId={dashboardChatId}
            initialTab={dashboardTab}
            onTabChange={setDashboardTab}
          />
        </div>
      </main>
      <IncomingCallModal />
      <IncomingChatModal />
    </>
  );
}

export default function App() {
  return (
    <div className="min-h-dvh bg-[#050505] text-white font-sans selection:bg-blue-500/30 overflow-x-hidden relative flex flex-col">
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-600/10 blur-[120px] rounded-full pointer-events-none" />
      <AppNav />
    </div>
  );
}
