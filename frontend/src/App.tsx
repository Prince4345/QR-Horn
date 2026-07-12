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
  return {
    scanCode: code ?? undefined,
    view: 'scanner' as 'scanner' | 'dashboard',
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
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-blue-500/30 overflow-x-hidden relative flex flex-col">
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Public scanner only — never float this over the owner dashboard / sticker studio */}
      {view === 'scanner' && (
        <div className="fixed top-4 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="bg-white/5 border border-white/10 backdrop-blur-md p-1 rounded-full flex gap-1 pointer-events-auto">
            <button
              onClick={openScanner}
              className="px-4 py-1.5 rounded-full text-sm font-medium bg-white/10 text-white flex items-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              Scanner
            </button>
            <button
              onClick={openDashboard}
              className="px-4 py-1.5 rounded-full text-sm font-medium text-slate-400 hover:text-white flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Owner login
            </button>
          </div>
        </div>
      )}

      <main className={`${view === 'scanner' ? 'pt-20' : 'pt-6'} pb-12 px-4 min-h-screen flex flex-col items-center`}>
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
