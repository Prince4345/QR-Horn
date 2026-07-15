import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Loader2, X, Zap } from 'lucide-react';
import { parseScanCodeFromQrText } from '../lib/scanUrl';
import { APP_NAME } from '../lib/brand';

interface QrCameraScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  elementId?: string;
  title?: string;
  subtitle?: string;
  onInvalidScan?: (raw: string) => void;
}

async function applyAutofocus(scanner: Html5Qrcode) {
  try {
    const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
      focusMode?: string[];
      exposureMode?: string[];
    };
    const advanced: MediaTrackConstraintSet[] = [];
    if (caps.focusMode?.includes('continuous')) {
      advanced.push({ focusMode: 'continuous' });
    } else if (caps.focusMode?.includes('single-shot')) {
      advanced.push({ focusMode: 'single-shot' });
    }
    if (caps.exposureMode?.includes('continuous')) {
      advanced.push({ exposureMode: 'continuous' });
    }
    if (advanced.length > 0) {
      await scanner.applyVideoConstraints({ advanced });
    }
  } catch {
    // Browser/device may not support manual focus control
  }
}

async function triggerRefocus(scanner: Html5Qrcode) {
  try {
    const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
      focusMode?: string[];
    };
    if (caps.focusMode?.includes('single-shot')) {
      await scanner.applyVideoConstraints({ advanced: [{ focusMode: 'single-shot' }] });
      if (caps.focusMode.includes('continuous')) {
        window.setTimeout(() => {
          void scanner.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }, 400);
      }
    } else {
      await applyAutofocus(scanner);
    }
  } catch {
    // ignore
  }
}

function buildCameraConstraints(): MediaTrackConstraints {
  return {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, min: 15 },
  };
}

export default function QrCameraScanner({
  onScan,
  onClose,
  elementId = 'qrhorn-qr-reader',
  title = 'Scan QR Sticker',
  subtitle = 'Hold steady — we detect the QR automatically',
  onInvalidScan,
}: QrCameraScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [focused, setFocused] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onInvalidRef = useRef(onInvalidScan);

  onScanRef.current = onScan;
  onInvalidRef.current = onInvalidScan;

  const handleRefocus = useCallback(() => {
    const scanner = scannerRef.current;
    if (!scanner?.isScanning) return;
    setFocused(true);
    void triggerRefocus(scanner);
    window.setTimeout(() => setFocused(false), 600);
  }, []);

  useEffect(() => {
    const scanner = new Html5Qrcode(elementId, {
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    scannerRef.current = scanner;
    let cancelled = false;
    let refocusInterval: ReturnType<typeof setInterval> | undefined;

    const scanConfig = {
      fps: 20,
      disableFlip: true,
      aspectRatio: 1,
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
        return { width: edge, height: edge };
      },
      videoConstraints: buildCameraConstraints(),
    };

    const onDecoded = (decoded: string) => {
      if (handledRef.current) return;
      const code = parseScanCodeFromQrText(decoded);
      if (!code) {
        onInvalidRef.current?.(decoded);
        setError(`Not a ${APP_NAME} sticker — try again`);
        window.setTimeout(() => setError(null), 2500);
        return;
      }
      handledRef.current = true;
      navigator.vibrate?.(40);
      onScanRef.current(code);
    };

    const startWithConstraints = async (constraints: MediaTrackConstraints) => {
      await scanner.start(constraints, scanConfig, onDecoded, () => {});
      await applyAutofocus(scanner);
      refocusInterval = window.setInterval(() => {
        if (!scanner.isScanning || handledRef.current) return;
        void applyAutofocus(scanner);
      }, 3000);
    };

    const start = async () => {
      try {
        try {
          await startWithConstraints(buildCameraConstraints());
        } catch {
          await startWithConstraints({ facingMode: 'environment' });
        }
        if (!cancelled) setStarting(false);
      } catch (err) {
        try {
          await startWithConstraints({ facingMode: 'user' });
          if (!cancelled) setStarting(false);
        } catch (inner) {
          if (!cancelled) {
            setStarting(false);
            const name = inner instanceof DOMException ? inner.name : '';
            setError(
              name === 'NotAllowedError'
                ? 'Camera blocked. Allow camera access in your browser settings and try again.'
                : name === 'NotFoundError'
                  ? 'No camera found on this device.'
                  : inner instanceof Error
                    ? inner.message
                    : 'Could not open camera.'
            );
          }
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (refocusInterval) clearInterval(refocusInterval);
      void (async () => {
        try {
          if (scanner.isScanning) await scanner.stop();
          scanner.clear();
        } catch {
          // ignore cleanup errors
        }
      })();
      scannerRef.current = null;
    };
  }, [elementId]);

  const handleClose = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
    } catch {
      // ignore
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white truncate">{title}</h2>
          <p className="text-[11px] text-white/50 truncate">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleClose()}
          className="shrink-0 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20"
          aria-label="Close scanner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <button
        type="button"
        className="relative flex-1 w-full min-h-0 flex items-center justify-center overflow-hidden qr-camera-fullscreen"
        onClick={handleRefocus}
        aria-label="Tap to focus camera"
      >
        <div id={elementId} className="absolute inset-0 w-full h-full" />

        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="relative w-[min(72vw,18rem)] aspect-square">
            <span className="absolute top-0 left-0 w-10 h-10 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
            <span className="absolute top-0 right-0 w-10 h-10 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
            <span className="absolute bottom-0 left-0 w-10 h-10 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
            <span className="absolute bottom-0 right-0 w-10 h-10 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />
            <div className="absolute inset-x-4 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent qr-scan-line" />
          </div>
        </div>

        {starting && !error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70">
            <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
            <p className="text-sm text-white/70">Starting camera…</p>
          </div>
        )}

        {focused && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full border-2 border-yellow-400/80 animate-ping" />
          </div>
        )}
      </button>

      <div className="z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-black/90 to-transparent text-center space-y-2">
        {error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <p className="text-white/70 text-sm flex items-center justify-center gap-2">
            <Zap className="w-4 h-4 text-blue-400 shrink-0" />
            Auto-scanning — tap screen to refocus
          </p>
        )}
      </div>
    </div>
  );
}
