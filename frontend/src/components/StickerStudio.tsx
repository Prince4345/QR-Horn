import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import {
  Car,
  Check,
  Image as ImageIcon,
  Instagram,
  Loader2,
  Plus,
  ScanLine,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import StickerQRCode from './StickerQRCode';
import QrCameraScanner from './QrCameraScanner';
import { getScanUrl } from '../lib/scanUrl';
import { QR_ART_PRESETS, getArtPreset } from '../lib/qrArtStyles';
import { api } from '../lib/api';
import { resolveCenterLogoUrl } from '../lib/brandLogo';
import { APP_NAME } from '../lib/brand';
import { resizeImageDataUrl } from '../lib/imageResize';
import {
  DEFAULT_STICKER_CUSTOMIZATION,
  socialLabel,
  type SocialPlatform,
  type StickerCustomization,
} from '../lib/stickerStyle';

const PLATFORM_OPTIONS: { id: SocialPlatform; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'x', label: 'X / Twitter' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'custom', label: 'Custom' },
];

interface StickerStudioProps {
  vehicleId: string;
  stickerCode: string;
  customImage: string | null;
  customization: StickerCustomization;
  saving: boolean;
  stickerRef: RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onChangeCustomization: (next: StickerCustomization) => void;
  onUploadImage: (dataUrl: string) => void;
  onClearImage: () => void;
  onSave: () => void;
}

export default function StickerStudio({
  vehicleId,
  stickerCode,
  customImage,
  customization,
  saving,
  stickerRef,
  onBack,
  onChangeCustomization,
  onUploadImage,
  onClearImage,
  onSave,
}: StickerStudioProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(customization);
  const [geminiEnabled, setGeminiEnabled] = useState(false);
  const [stylizing, setStylizing] = useState(false);
  const [stylizeError, setStylizeError] = useState<string | null>(null);
  const [showScanTest, setShowScanTest] = useState(false);
  const [scanTestResult, setScanTestResult] = useState<'success' | 'fail' | null>(null);
  const [qrSize, setQrSize] = useState(140);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setQrSize(w < 360 ? 96 : w < 420 ? 112 : w < 640 ? 128 : 140);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    setDraft(customization);
  }, [customization]);

  useEffect(() => {
    api.getAuthConfig().then((c) => setGeminiEnabled(c.geminiEnabled)).catch(() => setGeminiEnabled(false));
  }, []);

  const patch = (partial: Partial<StickerCustomization>) => {
    const next = { ...draft, ...partial };
    setDraft(next);
    onChangeCustomization(next);
  };

  const artPreset = getArtPreset(draft.artStyle);
  const photoStyle = draft.artStyle === 'photo' || draft.artStyle === 'photo-dots';
  const referenceImage = draft.qrReferenceImage ?? customImage;
  const hasBackground = draft.aiDesigned && !!customImage;
  const qrTextureImage = photoStyle ? referenceImage : null;
  const centerLogo = resolveCenterLogoUrl(draft.centerLogoImage);

  const cardBackground = hasBackground
    ? {
        backgroundImage: `url(${customImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: artPreset.card };

  const selectArtStyle = (styleId: (typeof QR_ART_PRESETS)[number]['id']) => {
    const preset = getArtPreset(styleId);
    patch({
      artStyle: styleId,
      qrDark: preset.darkColor,
      qrLight: preset.lightColor,
    });
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onUploadImage(dataUrl);
      patch({ qrReferenceImage: dataUrl, aiDesigned: false });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePhoto = () => {
    onClearImage();
    patch({ qrReferenceImage: null, aiDesigned: false });
  };

  const handleLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      resizeImageDataUrl(dataUrl, 160, 160, 'image/png')
        .then((resized) => patch({ centerLogoImage: resized }))
        .catch(() => patch({ centerLogoImage: dataUrl }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGenerateQrDesign = async () => {
    if (stylizing) return;
    if (!geminiEnabled) {
      setStylizeError('Add GEMINI_API_KEY to backend/.env and restart the server to use AI generation.');
      return;
    }

    setStylizing(true);
    setStylizeError(null);
    try {
      const { imageDataUrl } = await api.stylizeStickerImage(vehicleId, {
        style: draft.artStyle,
        aiPrompt: draft.aiPrompt,
        headline: draft.headline,
        tagline: draft.tagline,
        ...(referenceImage ? { imageData: referenceImage } : {}),
      });
      onUploadImage(imageDataUrl);
      patch({
        aiDesigned: true,
        qrReferenceImage: referenceImage ?? draft.qrReferenceImage,
      });
    } catch (err) {
      setStylizeError(err instanceof Error ? err.message : 'Failed to generate QR design');
    } finally {
      setStylizing(false);
    }
  };

  const addSocial = () => {
    if (draft.socials.length >= 3) return;
    patch({ socials: [...draft.socials, { platform: 'instagram', handle: '' }] });
  };

  const updateSocial = (index: number, partial: Partial<(typeof draft.socials)[number]>) => {
    patch({ socials: draft.socials.map((s, i) => (i === index ? { ...s, ...partial } : s)) });
  };

  const removeSocial = (index: number) => {
    patch({ socials: draft.socials.filter((_, i) => i !== index) });
  };

  const visibleSocials = draft.socials.filter((s) => s.handle.trim());

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
        >
          &larr; <span className="hidden sm:inline">Back to details</span><span className="sm:hidden">Back</span>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="hidden sm:block text-xs text-white/40">Sticker studio</span>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-lg shadow-blue-900/30 transition-all active:scale-95 shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save sticker
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
        {/* ---------- Preview ---------- */}
        <div className="flex flex-col items-center lg:sticky lg:top-2 w-full">
          <div
            ref={stickerRef}
            className="w-full max-w-[300px] aspect-[3/4] rounded-[28px] shadow-2xl ring-1 ring-white/10 relative overflow-hidden"
            style={cardBackground}
          >
            {/* legibility scrims — keep text readable over any art */}
            <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-black/70 via-black/25 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none" />

            <div className="relative z-10 h-full flex flex-col justify-between p-4 sm:p-5 text-white">
              {/* Header */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Car className="w-5 h-5 drop-shadow" />
                  <span className="font-display font-bold text-base tracking-tight uppercase drop-shadow">
                    {draft.headline || DEFAULT_STICKER_CUSTOMIZATION.headline}
                  </span>
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/90 drop-shadow">
                  {draft.tagline || DEFAULT_STICKER_CUSTOMIZATION.tagline}
                </p>
              </div>

              {/* QR with themed frame */}
              <div className="flex justify-center">
                <StickerQRCode
                  code={stickerCode}
                  size={qrSize}
                  artStyle={draft.artStyle}
                  darkColor={draft.qrDark}
                  lightColor={draft.qrLight}
                  imageDataUrl={qrTextureImage}
                  logoText={(draft.headline || 'Q').trim().charAt(0)}
                  logoImageDataUrl={centerLogo}
                  withFrame
                  className="max-w-full h-auto"
                />
              </div>

              {/* Footer */}
              <div className="space-y-2">
                {draft.showUrl && (
                  <p className="text-[9px] font-mono text-center text-white/70 break-all">
                    {getScanUrl(stickerCode)}
                  </p>
                )}

                {visibleSocials.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {visibleSocials.map((s, i) => (
                      <div
                        key={`${s.platform}-${i}`}
                        className="py-1.5 px-3 rounded-lg flex items-center justify-center gap-2 bg-white/15 backdrop-blur-md"
                      >
                        {s.platform === 'instagram' ? (
                          <Instagram className="w-3.5 h-3.5" />
                        ) : (
                          <span className="text-[10px] font-bold uppercase text-white/80">{s.platform}</span>
                        )}
                        <span className="text-xs font-semibold">{socialLabel(s)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {draft.showBadge && (
                  <div className="py-2 px-4 rounded-lg flex items-center justify-center gap-2 bg-white/15 backdrop-blur-md">
                    <Shield className="w-4 h-4" />
                    <span className="text-xs font-semibold">Secure Contact Line</span>
                  </div>
                )}

                <p className="text-[9px] font-medium tracking-widest uppercase text-center text-white/60">
                  Powered by {APP_NAME}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            <button
              type="button"
              onClick={() => {
                setScanTestResult(null);
                setShowScanTest(true);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 text-sm font-medium flex items-center gap-2"
            >
              <ScanLine className="w-4 h-4" />
              Test scan
            </button>
          </div>
          {scanTestResult === 'success' && (
            <p className="text-emerald-400 text-sm mt-2 text-center font-medium">QR scans correctly!</p>
          )}
          {scanTestResult === 'fail' && (
            <p className="text-red-400 text-sm mt-2 text-center">
              Wrong code scanned — point at your sticker QR and try again.
            </p>
          )}
          <p className="text-white/40 text-xs mt-2 text-center max-w-xs">
            Live preview · 3×4 print size · Test-scan before printing.
          </p>
        </div>

        {/* ---------- Controls ---------- */}
        {/* Inner scroll only on desktop — on mobile the page itself scrolls */}
        <div className="space-y-5 text-left lg:max-h-[640px] lg:overflow-y-auto lg:pr-2 lg:-mr-2 custom-scroll">
          {/* AI design */}
          <section className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.10] to-fuchsia-500/[0.04] p-5">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-violet-300" />
              <h3 className="text-sm font-semibold text-white">Design with AI</h3>
            </div>
            <p className="text-xs text-white/40 mb-4">Upload a photo or describe a look, then generate.</p>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm flex items-center justify-center gap-2"
              >
                <ImageIcon className="w-4 h-4" />
                {referenceImage ? 'Change photo' : 'Upload photo'}
              </button>
              {referenceImage && (
                <button
                  onClick={handleRemovePhoto}
                  className="px-3 py-2.5 rounded-xl bg-red-500/15 text-red-300 hover:bg-red-500/25"
                  title="Remove photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

            <textarea
              value={draft.aiPrompt}
              onChange={(e) => patch({ aiPrompt: e.target.value })}
              maxLength={300}
              rows={3}
              placeholder="Describe your design — e.g. royal gold mandala border, coffee shop vibe, use my car photo colors…"
              className="w-full mb-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-500/50 resize-none"
            />

            <button
              type="button"
              onClick={handleGenerateQrDesign}
              disabled={stylizing}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30 transition-all"
            >
              {stylizing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate {artPreset.name} Design
                </>
              )}
            </button>

            {!geminiEnabled && (
              <p className="text-[11px] text-amber-200/90 mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                Add <code className="text-amber-100">GEMINI_API_KEY</code> to{' '}
                <code className="text-amber-100">backend/.env</code> and restart{' '}
                <code className="text-amber-100">npm run dev</code>.
              </p>
            )}
            {stylizeError && <p className="text-xs text-red-300 mt-3">{stylizeError}</p>}
          </section>

          {/* Style — connected to Generate */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Choose a style</h3>
            <p className="text-xs text-white/40 mb-3">Sets the card theme and QR look.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {QR_ART_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectArtStyle(preset.id)}
                  className={`group p-2 rounded-2xl border text-left transition-all ${
                    draft.artStyle === preset.id
                      ? 'border-violet-500/70 bg-violet-500/15 ring-1 ring-violet-500/40'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <div
                    className="w-full aspect-[4/3] rounded-xl mb-2 border border-white/10 relative overflow-hidden"
                    style={{ background: preset.card }}
                  >
                    {draft.artStyle === preset.id && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white text-violet-700 flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-white leading-tight">{preset.name}</p>
                  <p className="text-[10px] text-white/40 leading-tight mt-0.5">{preset.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Center logo */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white mb-2">Center logo</h3>
            <p className="text-xs text-white/40 mb-3">
              Your brand logo sits in the QR center by default. Upload a different icon to replace it.
            </p>
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {draft.centerLogoImage ? 'Change logo' : 'Upload custom logo'}
              </button>
              <img
                src={centerLogo ?? undefined}
                alt="Center logo"
                className="w-10 h-10 rounded-lg object-contain bg-white border border-white/20 p-0.5"
              />
              {draft.centerLogoImage && (
                <button
                  type="button"
                  onClick={() => patch({ centerLogoImage: null })}
                  className="px-3 py-2.5 rounded-xl bg-red-500/15 text-red-300 hover:bg-red-500/25"
                  title="Reset to brand logo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoFile}
            />
          </section>

          {/* Text */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Text on sticker</h3>
            <input
              value={draft.headline}
              onChange={(e) => patch({ headline: e.target.value })}
              maxLength={40}
              placeholder="Headline (e.g. Scan to Contact)"
              className="w-full mb-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
            />
            <input
              value={draft.tagline}
              onChange={(e) => patch({ tagline: e.target.value })}
              maxLength={60}
              placeholder="Tagline (e.g. Need Owner? Move Vehicle?)"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </section>

          {/* Socials */}
          <section className="relative z-30 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Social handles</h3>
              <button
                onClick={addSocial}
                disabled={draft.socials.length >= 3}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {draft.socials.length === 0 && (
                <p className="text-xs text-white/40">Optional — show Instagram, X, etc. on the sticker.</p>
              )}
              {draft.socials.map((social, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <select
                    value={social.platform}
                    onChange={(e) => updateSocial(index, { platform: e.target.value as SocialPlatform })}
                    className="px-2 py-2 rounded-xl bg-slate-800 border border-white/10 text-xs text-white"
                  >
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={social.handle}
                    onChange={(e) => updateSocial(index, { handle: e.target.value })}
                    placeholder="@handle"
                    className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                  <button onClick={() => removeSocial(index)} className="text-white/40 hover:text-red-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* QR colors + toggles */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-xs text-white/60">
              QR dark
              <input
                type="color"
                value={draft.qrDark}
                onChange={(e) => patch({ qrDark: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-white/60">
              QR light
              <input
                type="color"
                value={draft.qrLight}
                onChange={(e) => patch({ qrLight: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={draft.showUrl}
                onChange={(e) => patch({ showUrl: e.target.checked })}
              />
              Show URL
            </label>
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={draft.showBadge}
                onChange={(e) => patch({ showBadge: e.target.checked })}
              />
              Secure badge
            </label>
          </section>
        </div>
      </div>

      {showScanTest && (
        <QrCameraScanner
          elementId="sticker-studio-qr-reader"
          title="Test your sticker QR"
          subtitle="Point your phone camera at the QR in the preview above."
          onScan={(code) => {
            setShowScanTest(false);
            setScanTestResult(code === stickerCode ? 'success' : 'fail');
          }}
          onInvalidScan={() => setScanTestResult('fail')}
          onClose={() => setShowScanTest(false)}
        />
      )}
    </div>
  );
}
