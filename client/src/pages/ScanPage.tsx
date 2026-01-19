import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import type { Comic } from '../types/comic';

const API_URL = import.meta.env.VITE_API_URL;

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type ScanResult = 'added' | 'duplicate' | null;

export function ScanPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isScanning, setIsScanning] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [lastComic, setLastComic] = useState<Comic | null>(null);
  const [lastScanResult, setLastScanResult] = useState<ScanResult>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

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

  // Start camera on mount when connected
  useEffect(() => {
    if (status === 'connected' && !isCameraActive) {
      startCamera();
    }
  }, [status]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraActive(true);

    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Could not access camera. Please allow camera permissions.');
    }
  }, []);

  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !socketRef.current || !sessionId) return;
    if (isScanning) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ensure video is ready and has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Camera not ready. Please try again.');
      return;
    }

    // Show capture flash
    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 200);

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    ctx.drawImage(video, 0, 0);

    // Convert to blob with high quality for barcode readability
    canvas.toBlob(async (blob) => {
      if (!blob || !socketRef.current) return;

      setIsScanning(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append('image', blob, 'capture.jpg');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/api/upload`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to scan barcode');
        }

        // Send comic to desktop (desktop will notify if duplicate)
        socketRef.current.emit('barcode-scanned', { sessionId, comic: data });
        setScanCount(prev => prev + 1);
        setLastComic(data);
        setLastScanResult('added');

      } catch (err) {
        console.error('Scan error:', err);
        setError(err instanceof Error ? err.message : 'Scan failed');
      } finally {
        setIsScanning(false);
      }
    }, 'image/jpeg', 0.95);
  }, [sessionId, isScanning]);

  function handleDisconnect() {
    stopCamera();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setStatus('disconnected');
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
      <div className="scan-header-minimal">
        <span className="scan-status connected">Connected</span>
        {scanCount > 0 && <span className="scan-count">{scanCount} scanned</span>}
      </div>

      <div className="scan-content-live">
        {/* Live Camera View */}
        <div className="live-camera-fullscreen">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="live-camera-video-full"
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Capture flash */}
          <div className={`capture-flash ${isCapturing ? 'active' : ''}`} />

          {cameraError && (
            <div className="camera-error">{cameraError}</div>
          )}

          {!isCameraActive && !cameraError && (
            <button onClick={startCamera} className="start-camera-button">
              Start Camera
            </button>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="scan-controls">
          {/* Last Scanned Comic (mini) */}
          {lastComic && (
            <div className={`scanned-comic-mini ${lastScanResult === 'duplicate' ? 'duplicate' : ''}`}>
              <img
                src={lastComic.coverImage}
                alt={lastComic.name}
                className="scanned-comic-image-mini"
              />
              <div className="scanned-comic-info-mini">
                <p className="scanned-comic-name-mini">{lastComic.name}</p>
                {lastScanResult === 'duplicate' ? (
                  <p className="scanned-comic-status duplicate">Already in collection</p>
                ) : (
                  <p className="scanned-comic-status added">Added!</p>
                )}
              </div>
            </div>
          )}

          {/* Capture Button */}
          <button
            onClick={captureAndScan}
            disabled={isScanning || !isCameraActive}
            className={`capture-button ${isScanning ? 'scanning' : ''}`}
          >
            <div className="capture-button-inner" />
          </button>

          {/* Disconnect */}
          <button onClick={handleDisconnect} className="disconnect-button-mini">
            Exit
          </button>
        </div>

        {error && (
          <div className="scan-error-toast">{error}</div>
        )}
      </div>
    </div>
  );
}
