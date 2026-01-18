import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { io, Socket } from 'socket.io-client';
import type { Comic } from '../types/comic';

const API_URL = import.meta.env.VITE_API_URL;
// For local dev, set VITE_CLIENT_URL to your local IP (e.g., http://192.168.1.100:5173)
// For production, this defaults to the current origin
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || window.location.origin;

interface QRConnectProps {
  onComicReceived: (comic: Comic) => void;
}

type ConnectionStatus = 'disconnected' | 'waiting' | 'connected';

export function QRConnect({ onComicReceived }: QRConnectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const generateSessionId = useCallback(() => {
    return crypto.randomUUID();
  }, []);

  const openModal = useCallback(() => {
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    setIsOpen(true);
    setStatus('waiting');
  }, [generateSessionId]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setSessionId(null);
    setStatus('disconnected');
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  }, [socket]);

  useEffect(() => {
    if (!isOpen || !sessionId) return;

    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Desktop socket connected');
      newSocket.emit('join-session', sessionId);
    });

    newSocket.on('phone-connected', () => {
      console.log('Phone connected to session');
      setStatus('connected');
    });

    newSocket.on('phone-disconnected', () => {
      console.log('Phone disconnected from session');
      setStatus('waiting');
    });

    newSocket.on('comic-received', (comic: Comic) => {
      console.log('Comic received from phone:', comic);
      onComicReceived(comic);
    });

    newSocket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isOpen, sessionId, onComicReceived]);

  const scanUrl = sessionId
    ? `${CLIENT_URL}/scan/${sessionId}`
    : '';

  return (
    <>
      <button onClick={openModal} className="qr-connect-button">
        Connect Phone
      </button>

      {isOpen && (
        <div className="qr-modal-overlay" onClick={closeModal}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="qr-modal-close" onClick={closeModal}>
              &times;
            </button>

            <h2>Scan with Phone</h2>

            <div className="qr-code-container">
              {sessionId && (
                <QRCodeSVG
                  value={scanUrl}
                  size={200}
                  level="M"
                  includeMargin
                />
              )}
            </div>

            <div className={`qr-status qr-status-${status}`}>
              {status === 'waiting' && (
                <>
                  <span className="status-dot waiting"></span>
                  Waiting for phone...
                </>
              )}
              {status === 'connected' && (
                <>
                  <span className="status-dot connected"></span>
                  Phone connected! Ready to scan.
                </>
              )}
            </div>

            <p className="qr-instructions">
              Scan this QR code with your phone camera to connect and start scanning barcodes.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
