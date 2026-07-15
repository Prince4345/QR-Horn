import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Car,
  Bike,
  Plus,
  QrCode,
  Download,
  BellRing,
  Printer,
  Phone,
  MessageSquare,
  Loader2,
  ExternalLink,
  LogOut,
  Bell,
  Pencil,
} from 'lucide-react';
import { api, type Vehicle, type Activity } from '../lib/api';
import { playPingSound } from '../lib/pingSound';
import {
  captureStickerForPrint,
  createStickerPdf,
  downloadStickerPng,
} from '../lib/stickerExport';
import { useAuth } from '../context/AuthContext';
import AuthPage from './AuthPage';
import AddVehicleModal from './AddVehicleModal';
import EditVehicleModal from './EditVehicleModal';
import ProfileModal from './ProfileModal';
import StickerStudio from './StickerStudio';
import {
  DEFAULT_STICKER_CUSTOMIZATION,
  parseStickerCustomization,
  type StickerCustomization,
} from '../lib/stickerStyle';
import { useChat } from '../context/ChatContext';
import ChatPanel from './ChatPanel';

function formatActivityTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${time}`;
}

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function PhoneAlertsBanner({
  onEnable,
  pushLoading,
  isMobile,
  hasPhone,
}: {
  onEnable: () => void;
  pushLoading: boolean;
  isMobile: boolean;
  hasPhone: boolean;
}) {
  return (
    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
      <p className="text-amber-200 text-sm font-medium mb-2">Get alerts on your phone</p>
      {isMobile ? (
        <p className="text-amber-100/70 text-xs mb-3 leading-relaxed">
          Tap below to allow notifications on <strong>this phone</strong>. Alerts are delivered only to devices where you enable them.
        </p>
      ) : (
        <p className="text-amber-100/70 text-xs mb-3 leading-relaxed">
          Desktop alerts do <strong>not</strong> reach your phone. Open{' '}
          <span className="font-mono text-amber-100">{window.location.origin}</span> on your phone,
          sign in, and enable notifications there.
        </p>
      )}
      <p className="text-amber-100/60 text-xs mb-3 leading-relaxed">
        {hasPhone
          ? 'Alerts can also be sent by SMS to your saved mobile number — even when the app is closed.'
          : 'Add your mobile number in your profile so we can also send SMS alerts when the app is closed.'}
      </p>
      <button
        onClick={onEnable}
        disabled={pushLoading}
        className="px-4 py-2 bg-amber-500 text-black rounded-xl text-sm font-semibold flex items-center gap-2"
      >
        {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
        Enable on this device
      </button>
    </div>
  );
}

interface DashboardProps {
  isActive?: boolean;
  openChatSessionId?: string;
}

export default function Dashboard({ isActive = true, openChatSessionId }: DashboardProps) {
  const { session, setupComplete, profileLoading, owner, authError, refreshProfile, signOut, clearAuthError } = useAuth();

  if (profileLoading && !owner && !authError) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  // Signed in but profile incomplete → always show name/phone form (not a hard error)
  if (session && !setupComplete) {
    // Soft errors (e.g. old auto-setup 400) should not block the profile form
    if (authError && /backend|timed out|Could not reach|port 3001/i.test(authError)) {
      return (
        <div className="w-full max-w-md text-center py-16 px-6">
          <p className="text-red-400 mb-4">{authError}</p>
          <p className="text-white/50 text-sm mb-6">
            You are signed in, but we could not reach the server. Check that the site is awake and try again.
          </p>
          <button
            onClick={() => {
              clearAuthError();
              refreshProfile();
            }}
            className="px-6 py-3 bg-blue-600 rounded-xl font-semibold mr-3"
          >
            Retry
          </button>
          <button onClick={signOut} className="px-6 py-3 bg-white/10 rounded-xl">
            Sign out
          </button>
        </div>
      );
    }
    return <AuthPage />;
  }

  if (!session) {
    return <AuthPage />;
  }

  return <DashboardContent isActive={isActive} openChatSessionId={openChatSessionId} />;
}

function DashboardContent({ isActive = true, openChatSessionId }: DashboardProps) {
  const { owner, signOut, enablePushNotifications, preparePushNotifications, pushEnabled } = useAuth();
  const {
    sessions,
    activeSession,
    loadingSession,
    openChat,
    openSessionId,
    sendOwnerMessage,
    blockSession,
    closeOpenChat,
    refreshSessions,
  } = useChat();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSticker, setShowSticker] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'messages'>('overview');
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [themeId, setThemeId] = useState('default');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [stickerCustomization, setStickerCustomization] = useState<StickerCustomization>(
    DEFAULT_STICKER_CUSTOMIZATION
  );
  const [savingSticker, setSavingSticker] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isMobile = isMobileDevice();
  const stickerRef = useRef<HTMLDivElement>(null);
  const hasLoadedVehicles = useRef(false);
  const lastActivityCount = useRef(0);

  const loadVehicles = async (silent = false) => {
    if (!silent && vehicles.length === 0) setLoading(true);
    if (!silent) setError(null);
    try {
      const data = await api.getVehicles();
      setVehicles(data);
      if (data.length === 0) {
        setSelectedVehicle(null);
      } else if (!selectedVehicle) {
        setSelectedVehicle(data[0]);
      } else {
        const updated = data.find((v) => v.id === selectedVehicle.id);
        setSelectedVehicle(updated ?? data[0]);
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load vehicles');
      } else {
        setActionError(err instanceof Error ? err.message : 'Failed to refresh vehicles');
      }
    } finally {
      if (!silent) setLoading(false);
      hasLoadedVehicles.current = true;
    }
  };

  const loadActivity = async (vehicleId: string) => {
    try {
      const data = await api.getActivity(vehicleId);
      if (isActive && data.length > lastActivityCount.current && lastActivityCount.current > 0) {
        playPingSound();
      }
      lastActivityCount.current = data.length;
      setActivities(data);
    } catch (err) {
      setActivities([]);
      setActionError(err instanceof Error ? err.message : 'Failed to load activity');
    }
  };

  const refreshPingsOnly = useCallback(async (vehicleId: string) => {
    try {
      const [activity, vehicle] = await Promise.all([
        api.getActivity(vehicleId),
        api.getVehicle(vehicleId),
      ]);
      if (isActive && activity.length > lastActivityCount.current && lastActivityCount.current > 0) {
        playPingSound();
      }
      lastActivityCount.current = activity.length;
      setActivities(activity);
      setSelectedVehicle((prev) =>
        prev?.id === vehicleId
          ? { ...prev, totalPings: vehicle.totalPings, callsMasked: vehicle.callsMasked }
          : prev
      );
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === vehicleId
            ? { ...v, totalPings: vehicle.totalPings, callsMasked: vehicle.callsMasked }
            : v
        )
      );
    } catch {
      // silent background refresh
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive && !hasLoadedVehicles.current) {
      loadVehicles();
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !openChatSessionId) return;
    setDetailTab('messages');
    setShowSticker(false);
    void openChat(openChatSessionId);
  }, [isActive, openChatSessionId, openChat]);

  useEffect(() => {
    if (isActive && detailTab === 'messages') {
      void refreshSessions();
    }
  }, [isActive, detailTab, refreshSessions]);

  useEffect(() => {
    if (selectedVehicle) {
      loadActivity(selectedVehicle.id);
      setThemeId(selectedVehicle.stickerTheme || 'default');
      setCustomImage(selectedVehicle.stickerCustomImage);
      setStickerCustomization(
        parseStickerCustomization(selectedVehicle.stickerCustomization ?? DEFAULT_STICKER_CUSTOMIZATION)
      );
    }
  }, [selectedVehicle?.id]);

  useEffect(() => {
    if (!pushEnabled && isActive) {
      preparePushNotifications().catch(() => {});
    }
  }, [pushEnabled, preparePushNotifications, isActive]);

  useEffect(() => {
    if (!selectedVehicle || !isActive) return;

    const vehicleId = selectedVehicle.id;
    const tick = () => {
      if (document.visibilityState === 'visible') {
        refreshPingsOnly(vehicleId);
      }
    };

    const onVisible = () => tick();
    const onPush = () => tick();

    const interval = setInterval(tick, 5000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('qrhorn:ping', onPush);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('qrhorn:ping', onPush);
    };
  }, [selectedVehicle?.id, refreshPingsOnly, isActive]);

  const handleSaveSticker = async () => {
    if (!selectedVehicle) return;
    setSavingSticker(true);
    setActionError(null);
    try {
      await api.updateSticker(selectedVehicle.id, {
        themeId,
        customImageData: customImage,
        customization: stickerCustomization,
      });
      await loadVehicles(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save sticker');
    } finally {
      setSavingSticker(false);
    }
  };

  const handleUploadImage = (dataUrl: string) => {
    setCustomImage(dataUrl);
    setStickerCustomization((prev) => ({
      ...prev,
      qrReferenceImage: dataUrl,
      aiDesigned: false,
      imageMode: prev.imageMode === 'none' ? 'background' : prev.imageMode,
    }));
  };

  const handleClearImage = () => {
    setCustomImage(null);
    setStickerCustomization((prev) => ({
      ...prev,
      imageMode: 'none',
      qrReferenceImage: null,
      aiDesigned: false,
      artStyle: prev.artStyle === 'photo' || prev.artStyle === 'photo-dots' ? 'dots' : prev.artStyle,
    }));
  };

  const handleTheftModeToggle = async () => {
    if (!selectedVehicle) return;
    setActionError(null);
    try {
      await api.updateTheftMode(selectedVehicle.id, !selectedVehicle.theftMode);
      await loadVehicles(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update theft mode');
    }
  };

  const captureStickerCanvas = async () => {
    if (!stickerRef.current) throw new Error('Sticker not ready');
    return captureStickerForPrint(stickerRef.current);
  };

  const handleDownloadPng = async () => {
    if (!selectedVehicle) return;
    setDownloading(true);
    setActionError(null);
    try {
      const canvas = await captureStickerCanvas();
      downloadStickerPng(
        canvas,
        `qrhorn-${selectedVehicle.name.replace(/\s+/g, '-').toLowerCase()}-3x4-300dpi.png`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to download sticker');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrintPdf = async () => {
    if (!selectedVehicle) return;
    setPrinting(true);
    setActionError(null);
    try {
      const canvas = await captureStickerCanvas();
      await createStickerPdf(
        canvas,
        selectedVehicle.name,
        selectedVehicle.number,
        `qrhorn-${selectedVehicle.name.replace(/\s+/g, '-').toLowerCase()}-print.pdf`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create PDF');
    } finally {
      setPrinting(false);
    }
  };

  const handleEnablePush = async () => {
    setPushLoading(true);
    setActionError(null);
    try {
      await enablePushNotifications();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to enable notifications');
    } finally {
      setPushLoading(false);
    }
  };

  if (loading && vehicles.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error && vehicles.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={loadVehicles} className="px-4 py-2 bg-white/10 rounded-xl">Retry</button>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <>
        <div className="w-full max-w-md text-center py-16">
          <h2 className="text-2xl font-bold mb-2">Welcome, {owner?.name}</h2>
          <p className="text-white/50 text-sm mb-8">Add your first vehicle to get a QR sticker and start receiving contact requests.</p>
          {!pushEnabled && (
            <div className="mb-6">
              <PhoneAlertsBanner
                onEnable={handleEnablePush}
                pushLoading={pushLoading}
                isMobile={isMobile}
                hasPhone={!!owner?.phone}
              />
            </div>
          )}
          <button
            onClick={() => setShowAddVehicle(true)}
            className="px-8 py-4 bg-blue-600 rounded-2xl font-semibold flex items-center gap-2 mx-auto"
          >
            <Plus className="w-5 h-5" /> Add Your First Vehicle
          </button>
          {!pushEnabled && (
            <button
              onClick={handleEnablePush}
              disabled={pushLoading}
              className="mt-4 px-6 py-3 bg-white/10 rounded-2xl text-sm flex items-center gap-2 mx-auto"
            >
              {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              Enable Push Notifications
            </button>
          )}
          <div className="mt-6 flex items-center justify-center gap-6">
            <button onClick={() => setShowProfile(true)} className="text-sm text-slate-500 hover:text-white flex items-center gap-1">
              <Pencil className="w-4 h-4" /> Profile
            </button>
            <button onClick={signOut} className="text-sm text-slate-500 hover:text-white flex items-center gap-1">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
        {showAddVehicle && (
          <AddVehicleModal
            onClose={() => setShowAddVehicle(false)}
            onAdded={loadVehicles}
          />
        )}
        {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      </>
    );
  }

  if (!selectedVehicle) return null;

  return (
    <>
    {(actionError || error) && vehicles.length > 0 && (
      <div className="w-full max-w-4xl mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start justify-between gap-4">
        <p className="text-red-300 text-sm">{actionError || error}</p>
        <button
          onClick={() => { setActionError(null); setError(null); }}
          className="text-red-400/70 hover:text-red-300 text-xs shrink-0"
        >
          Dismiss
        </button>
      </div>
    )}
    {!pushEnabled && (
      <div className="w-full max-w-4xl mb-4">
        <PhoneAlertsBanner
          onEnable={handleEnablePush}
          pushLoading={pushLoading}
          isMobile={isMobile}
          hasPhone={!!owner?.phone}
        />
      </div>
    )}
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`w-full grid grid-cols-1 md:grid-cols-12 gap-6 transition-[max-width] ${
        showSticker ? 'max-w-6xl' : 'max-w-4xl'
      }`}
    >
      <div className={`md:col-span-5 flex-col gap-6 ${showSticker ? 'hidden' : 'flex'}`}>
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl sm:rounded-[40px] p-5 sm:p-8 flex-1 flex flex-col">
          <div className="flex flex-wrap justify-between items-start gap-3 mb-6 sm:mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-light mb-1">Active Vehicles</h2>
              <p className="text-white/40 text-sm italic">{vehicles.length} Vehicles Protected</p>
            </div>
            <button
              onClick={() => setShowAddVehicle(true)}
              className="px-5 py-2.5 sm:px-6 sm:py-3 bg-white text-black rounded-full font-semibold text-sm transition-transform active:scale-95 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Vehicle
            </button>
          </div>

          <div className="flex flex-col gap-4 overflow-hidden">
            {vehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                onClick={() => { setSelectedVehicle(vehicle); setShowSticker(false); }}
                className={`p-4 sm:p-5 rounded-3xl border flex items-center gap-4 sm:gap-6 transition-colors cursor-pointer text-left ${
                  selectedVehicle.id === vehicle.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5 hover:bg-white/10'
                }`}
              >
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center shrink-0">
                  {vehicle.type === 'car' ? <Car className="w-8 h-8 text-blue-400" /> : <Bike className="w-8 h-8 text-blue-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold truncate">
                    {vehicle.name}{' '}
                    <span className="text-white/30 text-xs ml-2 uppercase tracking-widest">{vehicle.number}</span>
                  </h3>
                  <p className="text-sm text-white/50 truncate">Status: {vehicle.active ? 'Protected' : 'Inactive'}</p>
                </div>
                <div className={`h-8 px-3 rounded-lg text-[10px] font-bold flex items-center uppercase tracking-wider shrink-0 ${
                  vehicle.active ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/40'
                }`}>
                  {vehicle.active ? 'Live' : 'Off'}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-auto pt-6">
            <button
              onClick={handleTheftModeToggle}
              className="w-full p-6 bg-orange-600/10 border border-orange-500/20 rounded-3xl flex items-center justify-between hover:bg-orange-600/15 transition-colors text-left"
            >
              <div>
                <h4 className="text-orange-400 font-bold text-sm uppercase tracking-wider">Theft Mode</h4>
                <p className="text-xs text-orange-200/60">Priority push/SMS alerts when someone contacts this vehicle.</p>
              </div>
              <div className={`w-12 h-6 rounded-full relative shrink-0 transition-colors ${selectedVehicle.theftMode ? 'bg-orange-500' : 'bg-white/10'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${selectedVehicle.theftMode ? 'left-7' : 'left-1'}`} />
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className={`bg-white/5 border border-white/10 backdrop-blur-2xl rounded-3xl sm:rounded-[40px] p-4 sm:p-8 min-h-0 sm:min-h-[500px] ${
        showSticker ? 'md:col-span-12' : 'md:col-span-7'
      }`}>
        <AnimatePresence mode="wait">
          {!showSticker ? (
            <motion.div key="details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => { setDetailTab('overview'); closeOpenChat(); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${detailTab === 'overview' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setDetailTab('messages')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${detailTab === 'messages' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Messages
                  {sessions.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-[10px] font-bold">{sessions.length}</span>
                  )}
                </button>
              </div>

              {detailTab === 'messages' ? (
                <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
                  <div className="lg:w-56 shrink-0 space-y-2 max-h-48 lg:max-h-none overflow-y-auto">
                    {sessions.length === 0 ? (
                      <p className="text-slate-500 text-sm">No active chats.</p>
                    ) : (
                      sessions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => void openChat(s.id)}
                          className={`w-full text-left p-3 rounded-xl border transition-colors ${
                            openSessionId === s.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5 hover:bg-white/10'
                          }`}
                        >
                          <p className="text-sm font-medium truncate">{s.vehicleName}</p>
                          <p className="text-[10px] font-mono text-slate-500 truncate">{s.vehicleNumber}</p>
                          {s.lastMessage && (
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{s.lastMessage.body}</p>
                          )}
                          {s.readOnly && (
                            <span className="text-[10px] text-amber-400 uppercase mt-1 inline-block">Read-only</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex-1 min-h-[360px] bg-white/5 rounded-2xl p-4 border border-white/5">
                    {openSessionId ? (
                      <ChatPanel
                        session={activeSession}
                        loading={loadingSession}
                        role="owner"
                        onSend={sendOwnerMessage}
                        onBlock={() => blockSession(openSessionId)}
                      />
                    ) : (
                      <p className="text-slate-500 text-sm text-center py-12">Select a conversation to reply.</p>
                    )}
                  </div>
                </div>
              ) : (
              <>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-display font-bold mb-2">{selectedVehicle.name}</h1>
                  <span className="px-3 py-1 rounded-md bg-white/10 font-mono text-sm tracking-widest text-slate-300">{selectedVehicle.number}</span>
                </div>
                <div className="flex flex-col gap-2 items-start sm:items-end">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setShowEditVehicle(true)}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm flex items-center gap-1"
                      title="Edit vehicle"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {!pushEnabled && (
                      <button
                        onClick={handleEnablePush}
                        disabled={pushLoading}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm flex items-center gap-1"
                        title="Enable push notifications"
                      >
                        {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => setShowProfile(true)}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm flex items-center gap-2"
                      title="Your profile"
                    >
                      <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[9px] font-bold">
                        {(owner?.name ?? '?')
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0]?.toUpperCase() ?? '')
                          .join('')}
                      </span>
                      Profile
                    </button>
                    <button onClick={() => setShowSticker(true)} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors flex items-center gap-2">
                      <QrCode className="w-4 h-4" /> Get Sticker
                    </button>
                  </div>
                  {pushEnabled && (
                    <span className="text-[10px] text-green-400 uppercase tracking-wider">Push alerts on</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <BellRing className="w-4 h-4 text-slate-400" />
                    <h3 className="font-medium text-slate-300">Total Pings</h3>
                  </div>
                  <p className="text-3xl font-display font-bold text-white">{selectedVehicle.totalPings}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <h3 className="font-medium text-slate-300">Voice Calls</h3>
                  </div>
                  <p className="text-3xl font-display font-bold text-white">{selectedVehicle.callsMasked}</p>
                </div>
              </div>

              <h3 className="text-lg font-medium text-slate-200 mb-4">Recent Activity</h3>
              <div className="flex-grow space-y-3">
                {activities.length === 0 ? (
                  <p className="text-slate-500 text-sm">No activity yet.</p>
                ) : (
                  activities.map((act) => (
                    <div key={act.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-white/5">
                      <div className="p-2 rounded-full bg-white/5">
                        {act.type === 'call' ? (
                          <Phone className="w-4 h-4 text-emerald-400" />
                        ) : act.type === 'chat' ? (
                          <MessageSquare className="w-4 h-4 text-violet-400" />
                        ) : (
                          <BellRing className="w-4 h-4 text-blue-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{act.reason}</p>
                        <p className="text-xs text-slate-500">{formatActivityTime(act.time)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              </>
              )}
            </motion.div>
          ) : (
            <motion.div key="sticker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
              {selectedVehicle.stickerCode ? (
                <>
                  <StickerStudio
                    vehicleId={selectedVehicle.id}
                    stickerCode={selectedVehicle.stickerCode}
                    customImage={customImage}
                    customization={stickerCustomization}
                    saving={savingSticker}
                    stickerRef={stickerRef}
                    onBack={() => setShowSticker(false)}
                    onChangeCustomization={setStickerCustomization}
                    onUploadImage={handleUploadImage}
                    onClearImage={handleClearImage}
                    onSave={handleSaveSticker}
                  />
                  <div className="flex flex-wrap items-center gap-3 mt-4 justify-center">
                    <button
                      onClick={() =>
                        window.open(
                          `${window.location.origin}/scan/${encodeURIComponent(selectedVehicle.stickerCode!)}`,
                          '_blank',
                          'noopener,noreferrer'
                        )
                      }
                      className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <ExternalLink className="w-4 h-4" /> Open public scan page
                    </button>
                    <button
                      onClick={handleDownloadPng}
                      disabled={downloading || printing}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium transition-colors flex items-center gap-2"
                    >
                      {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Download PNG
                    </button>
                    <button
                      onClick={handlePrintPdf}
                      disabled={downloading || printing}
                      className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-medium transition-colors flex items-center gap-2"
                    >
                      {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                      Print PDF
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-slate-400 text-sm text-center py-12">No sticker code yet.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
    {showAddVehicle && (
      <AddVehicleModal onClose={() => setShowAddVehicle(false)} onAdded={() => loadVehicles()} />
    )}
    {showEditVehicle && selectedVehicle && (
      <EditVehicleModal
        vehicle={selectedVehicle}
        onClose={() => setShowEditVehicle(false)}
        onSaved={() => loadVehicles()}
      />
    )}
    {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}
