/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import ScannerView from './components/ScannerView';
import Dashboard from './components/Dashboard';
import IncomingCallModal from './components/IncomingCallModal';
import { LayoutDashboard, QrCode } from 'lucide-react';
import { parseScanCodeFromPath } from './lib/scanUrl';

function getInitialState() {
  const code = parseScanCodeFromPath(window.location.pathname);
  // Push notifications deep-link owners straight to the dashboard
  const wantsDashboard =
    !code && new URLSearchParams(window.location.search).get('view') === 'dashboard';
  return {
    scanCode: code ?? undefined,
    view: (wantsDashboard ? 'dashboard' : 'scanner') as 'scanner' | 'dashboard',
  };
}

export default function App() {
  const [view, setView] = useState<'scanner' | 'dashboard'>(getInitialState().view);
  const [scanCode, setScanCode] = useState<string | undefined>(getInitialState().scanCode);

  const syncFromUrl = useCallback(() => {
    const code = parseScanCodeFromPath(window.location.pathname);
    if (code) {
      setScanCode(code);
      setView('scanner');
    } else {
      setScanCode(undefined);
    }
  }, []);

  useEffect(() => {
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [syncFromUrl]);

  // Notification tap on an already-open tab → jump to the dashboard
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'qrhorn:open-dashboard') {
        setView('dashboard');
        setScanCode(undefined);
        const url = event.data?.url as string | undefined;
        if (url) {
          window.history.replaceState(null, '', url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url);
        }
        window.dispatchEvent(new CustomEvent('qrhorn:incoming-call'));
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, []);

  const openDashboard = () => {
    setView('dashboard');
    setScanCode(undefined);
    window.history.pushState(null, '', '/');
  };

  const openScanner = () => {
    setView('scanner');
    if (!parseScanCodeFromPath(window.location.pathname)) {
      setScanCode(undefined);
      window.history.pushState(null, '', '/');
    }
  };

  return (
    <div className="min-h-dvh bg-[#050505] text-white font-sans selection:bg-blue-500/30 overflow-x-hidden relative flex flex-col">
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* App navigation — switch between public scanner and owner dashboard */}
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
          <button
            onClick={openDashboard}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 transition-colors shrink-0 ${
              view === 'dashboard' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">Owner</span>
            <span className="hidden sm:inline">Owner dashboard</span>
          </button>
        </div>
      </div>

      <main className="pt-[calc(4.5rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] px-2 sm:px-4 min-h-dvh flex flex-col items-center w-full">
        <div className={view === 'scanner' ? 'w-full flex flex-col items-center' : 'hidden'} aria-hidden={view !== 'scanner'}>
          <ScannerView scanCode={scanCode} />
        </div>
        <div className={view === 'dashboard' ? 'w-full flex flex-col items-center' : 'hidden'} aria-hidden={view !== 'dashboard'}>
          <Dashboard isActive={view === 'dashboard'} />
        </div>
      </main>
      <IncomingCallModal />
    </div>
  );
}
