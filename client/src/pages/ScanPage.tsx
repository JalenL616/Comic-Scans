import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import type { Comic } from '../types/comic';

const API_URL = import.meta.env.VITE_API_URL;
const SCAN_INTERVAL_MS = 500; // Scan every 0.5 seconds

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type ScanMode = 'manual' | 'live';
type ScanResult = 'added' | 'duplicate' | null;

export function ScanPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const lastScannedUpcRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [scanMode, setScanMode] = useState<ScanMode>('manual');
  const [isScanning, setIsScanning] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false); // For capture flash
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [lastComic, setLastComic] = useState<Comic | null>(null);
  const [lastScanResult, setLastScanResult] = useState<ScanResult>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Socket connection
  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      setError('Invalid session');
      return;
    }

    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Phone socket connected');
      newSocket.emit('phone-connect', sessionId);
      setStatus('connected');
    });

    newSocket.on('connect_error', (err: Error) => {
      console.error('Socket connection error:', err);
      setStatus('error');
      setError('Failed to connect. Please try scanning the QR code again.');
    });

    newSocket.on('disconnect', () => {
      console.log('Phone socket disconnected');
      setStatus('disconnected');
    });

    // Listen for duplicate notifications from desktop
    newSocket.on('duplicate-detected', (comic: Comic) => {
      console.log('Duplicate comic detected:', comic.name);
      setLastComic(comic);
      setLastScanResult('duplicate');
    });

    socketRef.current = newSocket;

    return () => {
      newSocket.disconnect();
    };
  }, [sessionId]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsLiveActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsLiveActive(true);
      lastScannedUpcRef.current = null;

      // Start scanning interval
      scanIntervalRef.current = window.setInterval(() => {
        captureAndScan();
      }, SCAN_INTERVAL_MS);

    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Could not access camera. Please allow camera permissions.');
    }
  }, []);

  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !socketRef.current || !sessionId) return;
    if (isScanning) return; // Skip if already scanning

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Show capture flash
    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 150);

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob || !socketRef.current) return;

      setIsScanning(true);

      try {
        const formData = new FormData();
        formData.append('image', blob, 'frame.jpg');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(`${API_URL}/api/upload`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Silent fail for live mode - just try again next frame
          return;
        }

        const data = await response.json();

        // Prevent duplicate scans of the same comic in a row
        if (data.upc === lastScannedUpcRef.current) {
          return;
        }

        lastScannedUpcRef.current = data.upc;

        // Send comic to desktop (desktop will notify if duplicate)
        socketRef.current.emit('barcode-scanned', { sessionId, comic: data });
        setScanCount(prev => prev + 1);
        setLastComic(data);
        setLastScanResult('added'); // Will be overwritten by duplicate-detected if needed

        // Brief pause after successful scan
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          setTimeout(() => {
            if (isLiveActive) {
              lastScannedUpcRef.current = null; // Allow rescanning after pause
              scanIntervalRef.current = window.setInterval(() => {
                captureAndScan();
              }, SCAN_INTERVAL_MS);
            }
          }, 2500);
        }

      } catch (err) {
        // Silent fail for live mode
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Scan error:', err);
        }
      } finally {
        setIsScanning(false);
      }
    }, 'image/jpeg', 0.8);
  }, [sessionId, isScanning, isLiveActive]);

  const toggleLiveMode = useCallback(() => {
    if (isLiveActive) {
      stopCamera();
      setScanMode('manual');
    } else {
      setScanMode('live');
      startCamera();
    }
  }, [isLiveActive, stopCamera, startCamera]);

  function handleDisconnect() {
    stopCamera();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setStatus('disconnected');
  }

  async function handleManualCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !socketRef.current || !sessionId) return;

    setIsScanning(true);
    setLastComic(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to scan barcode');
      }

      socketRef.current.emit('barcode-scanned', { sessionId, comic: data });
      setScanCount(prev => prev + 1);
      setLastComic(data);

    } catch (err) {
      console.error('Scan error:', err);
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setIsScanning(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  if (status === 'error') {
    return (
      <div className="scan-page">
        <div className="scan-error">
          <h2>Connection Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="scan-page">
        <div className="scan-connecting">
          <h2>Connecting...</h2>
          <p>Please wait while we connect to your desktop.</p>
        </div>
      </div>
    );
  }

  if (status === 'disconnected') {
    return (
      <div className="scan-page">
        <div className="scan-disconnected">
          <h2>Disconnected</h2>
          <p>You've disconnected from the desktop.</p>
          {scanCount > 0 && <p className="scan-count">{scanCount} comic{scanCount !== 1 ? 's' : ''} scanned</p>}
          <p className="scan-instructions">You can close this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scan-page">
      <div className="scan-header">
        <h1>Comic Scanner</h1>
        <p className="scan-status connected">Connected to desktop</p>
        {scanCount > 0 && <p className="scan-count">{scanCount} scanned</p>}
      </div>

      <div className="scan-content">
        {/* Mode Toggle */}
        <div className="scan-mode-toggle">
          <button
            className={`mode-button ${scanMode === 'manual' ? 'active' : ''}`}
            onClick={() => { stopCamera(); setScanMode('manual'); }}
          >
            Manual
          </button>
          <button
            className={`mode-button ${scanMode === 'live' ? 'active' : ''}`}
            onClick={toggleLiveMode}
          >
            Live Scan
          </button>
        </div>

        {/* Live Camera View */}
        {scanMode === 'live' && (
          <div className="live-camera-container">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="live-camera-video"
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Capture flash */}
            <div className={`capture-flash ${isCapturing ? 'active' : ''}`} />

            {/* Scanning indicator */}
            <div className={`scan-indicator ${isScanning ? 'active' : ''}`}>
              <div className="scan-line" />
            </div>

            {cameraError && (
              <div className="camera-error">{cameraError}</div>
            )}

            {!isLiveActive && !cameraError && (
              <button onClick={startCamera} className="start-camera-button">
                Start Camera
              </button>
            )}
          </div>
        )}

        {/* Last Scanned Comic */}
        {lastComic && (
          <div className={`scanned-comic ${lastScanResult === 'duplicate' ? 'duplicate' : ''}`}>
            <img
              src={lastComic.coverImage}
              alt={lastComic.name}
              className="scanned-comic-image"
            />
            <div className="scanned-comic-info">
              <p className="scanned-comic-name">{lastComic.name}</p>
              {lastScanResult === 'duplicate' ? (
                <p className="scanned-comic-duplicate">Already in collection</p>
              ) : (
                <p className="scanned-comic-added">Added to collection!</p>
              )}
            </div>
          </div>
        )}

        {/* Manual Mode */}
        {scanMode === 'manual' && (
          <>
            {!lastComic && (
              <p className="scan-instructions">
                Point your camera at a comic book barcode and tap capture.
              </p>
            )}

            <label className={`scan-button ${isScanning ? 'scanning' : ''}`}>
              {isScanning ? 'Scanning...' : lastComic ? 'Scan Another' : 'Capture Barcode'}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleManualCapture}
                disabled={isScanning}
                style={{ display: 'none' }}
              />
            </label>
          </>
        )}

        {/* Live Mode Instructions */}
        {scanMode === 'live' && isLiveActive && !lastComic && (
          <p className="scan-instructions">
            Point at a barcode. It will scan automatically.
          </p>
        )}

        {error && (
          <div className="scan-message error">{error}</div>
        )}

        <button onClick={handleDisconnect} className="disconnect-button">
          Disconnect
        </button>
      </div>
    </div>
  );
}
