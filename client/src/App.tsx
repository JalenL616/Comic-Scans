import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { SearchBar } from './components/SearchBar'
import { ComicGrid } from './components/ComicGrid'
import { Header } from './components/Header'
import { searchComics } from './services/api'
import { FileUpload } from './components/FileUpload'
import { QRConnect } from './components/QRConnect'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { ScanPage } from './pages/ScanPage'
import { useAuth } from './context/AuthContext'
import type { Comic } from './types/comic'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL;

function HomePage() {
  const { user, token } = useAuth();

  // Initialize comics from localStorage (works as cache for both logged-in and anonymous)
  const [comics, setComics] = useState<Comic[]>(() => {
    const saved = localStorage.getItem('comics');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load comics from API if logged in, clear if logged out
  useEffect(() => {
    if (user && token) {
      loadCollection();
    } else if (!user) {
      // User logged out - check if localStorage was cleared
      const saved = localStorage.getItem('comics');
      if (!saved) {
        setComics([]);
      }
    }
  }, [user, token]);

  // Save comics to localStorage (cache for both logged-in and anonymous)
  useEffect(() => {
    localStorage.setItem('comics', JSON.stringify(comics));
  }, [comics]);

  async function loadCollection() {
    try {
      const response = await fetch(`${API_URL}/api/collection`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setComics(data);
      }
    } catch (err) {
      console.error('Failed to load collection:', err);
    }
  }

  async function saveToCollection(comic: Comic) {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/collection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(comic)
      });
    } catch (err) {
      console.error('Failed to save comic:', err);
    }
  }

  async function removeFromCollection(upc: string) {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/collection/${upc}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Failed to remove comic:', err);
    }
  }

  async function handleSearch(upc: string) {
    setLoading(true);
    setError(null);

    try {
      const result = await searchComics(upc);

      if (result) {
        const isDuplicate = comics.some(c => c.upc === result.upc);

        if (isDuplicate) {
          setError('Comic already in results');
        } else {
          setComics(prev => [...prev, result]);
          if (user) saveToCollection(result);
        }
      } else {
        setError('Comic not found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  function handleClearAll() {
    setComics([]);
    // Note: This doesn't delete from DB - user can reload to get them back
  }

  function handleRemoveComic(upc: string) {
    setComics(prev => prev.filter(comic => comic.upc !== upc));
    if (user) removeFromCollection(upc);
  }

  function handleFileUpload(comic: Comic) {
    const isDuplicate = comics.some(c => c.upc === comic.upc);

    if (isDuplicate) {
      setError('Comic already in results');
    } else {
      setComics(prev => [...prev, comic]);
      setError(null);
      if (user) saveToCollection(comic);
    }
  }

  return (
    <>
      <div className="controls">
        <SearchBar onSearch={handleSearch} />
        <FileUpload onComicFound={handleFileUpload} />
        <QRConnect onComicReceived={handleFileUpload} />

        {comics.length > 0 && (
          <button onClick={handleClearAll} className="clear-button">
            Clear All ({comics.length})
          </button>
        )}
      </div>

      {loading && <div className="loading">Searching...</div>}
      {error && <div className="error">{error}</div>}

      <ComicGrid comics={comics} onRemoveComic={handleRemoveComic} />
    </>
  );
}

function App() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <div className="app loading">Loading...</div>;
  }

  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/scan/:sessionId" element={<ScanPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App
