import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Loader2, XCircle } from 'lucide-react';
import { parseScanCodeFromQrText } from '../lib/scanUrl';

interface QrCameraScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  elementId?: string;
  title?: string;
  subtitle?: string;
  onInvalidScan?: (raw: string) => void;
}

export default function QrCameraScanner({
  onScan,
  onClose,
  elementId = 'qrhorn-qr-reader',
  title = 'Scan QR Sticker',
  subtitle = 'Point your camera at the QR sticker on the vehicle.',
  onInvalidScan,
}: QrCameraScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onInvalidRef = useRef(onInvalidScan);

  onScanRef.current = onScan;
  onInvalidRef.current = onInvalidScan;

  useEffect(() => {
    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;
    let cancelled = false;

    const scanConfig = {
      fps: 10,
      // Relative box — a fixed 240px box breaks on phones whose camera
      // preview is smaller than that (html5-qrcode refuses to start).
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.75);
        return { width: edge, height: edge };
      },
    };

    const onDecoded = (decoded: string) => {
      if (handledRef.current) return;
      const code = parseScanCodeFromQrText(decoded);
      if (!code) {
        onInvalidRef.current?.(decoded);
        setError('QR not recognized — make sure you are scanning your QRHorn sticker');
        return;
      }
      handledRef.current = true;
      onScanRef.current(code);
    };

    const start = async () => {
      try {
        // Back camera first; some laptops/tablets only have a front camera.
        try {
          await scanner.start({ facingMode: 'environment' }, scanConfig, onDecoded, () => {});
        } catch {
          await scanner.start({ facingMode: 'user' }, scanConfig, onDecoded, () => {});
        }
        if (!cancelled) setStarting(false);
      } catch (err) {
        if (!cancelled) {
          setStarting(false);
          const name = err instanceof DOMException ? err.name : '';
          setError(
            name === 'NotAllowedError'
              ? 'Camera blocked. Tap the lock icon in your browser address bar, allow Camera, and try again.'
              : name === 'NotFoundError'
                ? 'No camera found on this device.'
                : err instanceof Error
                  ? err.message
                  : 'Could not open camera. Allow camera permission and try again.'
          );
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      const stop = async () => {
        try {
          if (scanner.isScanning) await scanner.stop();
          scanner.clear();
        } catch {
          // ignore cleanup errors
        }
      };
      void stop();
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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-[#111] border-0 sm:border border-white/10 rounded-t-[28px] sm:rounded-[32px] p-5 sm:p-6 relative max-h-[100dvh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          onClick={handleClose}
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 text-slate-400 hover:text-white z-10"
        >
          <XCircle className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2 mb-4 mt-2 sm:mt-0">
          <Camera className="w-5 h-5 text-blue-400 shrink-0" />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-black min-h-[45dvh] sm:min-h-[280px]">
          <div id={elementId} className="w-full" />
          {starting && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <p className="text-sm text-white/60">Starting camera...</p>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-red-400 text-sm text-center">{error}</p>}

        <p className="mt-4 text-white/40 text-xs text-center">{subtitle}</p>
      </div>
    </div>
  );
}
