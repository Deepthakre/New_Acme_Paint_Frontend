import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

let scannerIdCounter = 0;

interface QrScannerProps {
  active: boolean;
  onScan: (decodedText: string) => void;
}

/**
 * Renders a live camera feed and calls onScan(decodedText) every time a new
 * QR code is recognized. Debounces repeated reads of the same code so
 * holding the camera on one label doesn't fire onScan on every frame.
 */
export default function QrScanner({ active, onScan }: QrScannerProps) {
  const containerId = useRef(`qr-scanner-${++scannerIdCounter}`).current;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState('');
  const lastScanRef = useRef({ text: '', time: 0 });
  // Keep the latest onScan without re-running the scanner-start effect on
  // every parent re-render (a new inline callback would otherwise tear
  // down and restart the camera unnecessarily).
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (decodedText: string) => {
          const now = Date.now();
          // Camera keeps decoding every frame — ignore the same code again
          // within 2.5s so one label held in front of it doesn't re-fire.
          if (decodedText === lastScanRef.current.text && now - lastScanRef.current.time < 2500) return;
          lastScanRef.current = { text: decodedText, time: now };
          onScanRef.current(decodedText);
        },
        () => {} // per-frame "no QR found" callbacks are normal — ignore
      )
      .catch(() => {
        if (!cancelled) setError('Could not access the camera. Check browser permissions, or use manual entry instead.');
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
      }
    };
  }, [active, containerId]);

  if (!active) return null;

  return error ? (
    <div className="flex items-center gap-2 text-red text-sm bg-red/5 border border-red/20 rounded-lg px-3 py-2.5">{error}</div>
  ) : (
    <div id={containerId} className="rounded-xl overflow-hidden border border-line shadow-sm max-w-[360px]" />
  );
}
