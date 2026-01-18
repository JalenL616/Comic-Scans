import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { io, Socket } from 'socket.io-client';
import type { Comic } from '../types/comic';

const API_URL = import.meta.env.VITE_API_URL;
// For local dev, set VITE_CLIENT_URL to your local IP (e.g., http://192.168.1.100:5173)
// For production, this defaults to the current origin
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || window.location.origin;

interface QRConnectProps {
  onComicReceived: (comic: Comic) => boolean; // Returns true if added, false if duplicate
}

type ConnectionStatus = 'disconnected' | 'waiting' | 'connected';

export function QRConnect({ onComicReceived }: QRConnectProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const socketRef = useRef<Socket | null>(null);
  const onComicReceivedRef = useRef(onComicReceived);

  // Keep callback ref updated
  useEffect(() => {
    onComicReceivedRef.current = onComicReceived;
  }, [onComicReceived]);

  const connect = useCallback(() => {
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    setStatus('waiting');
    setIsModalOpen(true);

    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Desktop socket connected');
      newSocket.emit('join-session', newSessionId);
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
      const wasAdded = onComicReceivedRef.current(comic);
      if (!wasAdded) {
        // Notify phone that comic was a duplicate
        newSocket.emit('comic-duplicate', { sessionId: newSessionId, comic });
      }
    });

    newSocket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error);
    });

    socketRef.current = newSocket;
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSessionId(null);
    setStatus('disconnected');
    setIsModalOpen(false);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const scanUrl = sessionId
    ? `${CLIENT_URL}/scan/${sessionId}`
    : '';

  const isConnected = status === 'connected' || status === 'waiting';

  return (
    <>
      {!isConnected ? (
        <button onClick={connect} className="qr-connect-button">
          Connect Phone
        </button>
      ) : (
        <div className="qr-button-group">
          <button onClick={openModal} className="qr-connect-button qr-show-button">
            {status === 'connected' ? 'Phone Connected' : 'Show QR Code'}
          </button>
          <button onClick={disconnect} className="qr-disconnect-button">
            Disconnect
          </button>
        </div>
      )}

      {isModalOpen && sessionId && (
        <div className="qr-modal-overlay" onClick={closeModal}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="qr-modal-close" onClick={closeModal}>
              &times;
            </button>

            <h2>Scan with Phone</h2>

            <div className="qr-code-container">
              <QRCodeSVG
                value={scanUrl}
                size={200}
                level="M"
                includeMargin
              />
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
              {status === 'connected'
                ? 'You can close this modal. Comics will appear as you scan them.'
                : 'Scan this QR code with your phone camera to connect.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
