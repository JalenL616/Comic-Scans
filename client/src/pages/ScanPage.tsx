import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL;

type ConnectionStatus = 'connecting' | 'connected' | 'error';

export function ScanPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [sessionId]);

  async function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !socket || !sessionId) return;

    setIsScanning(true);
    setMessage(null);
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

      // Send comic to desktop via WebSocket
      socket.emit('barcode-scanned', { sessionId, comic: data });
      setMessage(`Found: ${data.name}`);

    } catch (err) {
      console.error('Scan error:', err);
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setIsScanning(false);
      // Reset input so same file can be selected again
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

  return (
    <div className="scan-page">
      <div className="scan-header">
        <h1>Comic Scanner</h1>
        <p className="scan-status connected">Connected to desktop</p>
      </div>

      <div className="scan-content">
        <label className={`scan-button ${isScanning ? 'scanning' : ''}`}>
          {isScanning ? 'Scanning...' : 'Capture Barcode'}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            disabled={isScanning}
            style={{ display: 'none' }}
          />
        </label>

        {message && (
          <div className="scan-message success">{message}</div>
        )}

        {error && (
          <div className="scan-message error">{error}</div>
        )}

        <p className="scan-instructions">
          Point your camera at a comic book barcode and tap capture.
          The comic will appear on your desktop instantly.
        </p>
      </div>
    </div>
  );
}
