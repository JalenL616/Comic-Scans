import { useState, useEffect, useMemo } from 'react'
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

type SortOption = 'custom' | 'a-z' | 'z-a';

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
  const [sortOption, setSortOption] = useState<SortOption>('custom');

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

  // Sort comics based on current option
  const sortedComics = useMemo(() => {
    // Always put starred comics first
    const starred = comics.filter(c => c.starred);
    const unstarred = comics.filter(c => !c.starred);

    const sortFn = (a: Comic, b: Comic) => {
      if (sortOption === 'a-z') {
        const seriesCompare = a.seriesName.localeCompare(b.seriesName);
        if (seriesCompare !== 0) return seriesCompare;
        // Same series - sort by issue number ascending
        return parseFloat(a.issueNumber) - parseFloat(b.issueNumber);
      } else if (sortOption === 'z-a') {
        const seriesCompare = b.seriesName.localeCompare(a.seriesName);
        if (seriesCompare !== 0) return seriesCompare;
        // Same series - sort by issue number ascending
        return parseFloat(a.issueNumber) - parseFloat(b.issueNumber);
      }
      // Custom order - use sortOrder
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    };

    return [...starred.sort(sortFn), ...unstarred.sort(sortFn)];
  }, [comics, sortOption]);

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

  async function updateStarred(upc: string, starred: boolean) {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/collection/${upc}/star`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ starred })
      });
    } catch (err) {
      console.error('Failed to update starred status:', err);
    }
  }

  async function updateSortOrder(comicsToUpdate: { upc: string; sortOrder: number }[]) {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/collection/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ comics: comicsToUpdate })
      });
    } catch (err) {
      console.error('Failed to update sort order:', err);
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
          const newComic = { ...result, sortOrder: comics.length };
          setComics(prev => [...prev, newComic]);
          if (user) saveToCollection(newComic);
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

  function handleToggleStar(upc: string) {
    setComics(prev => prev.map(comic => {
      if (comic.upc === upc) {
        const newStarred = !comic.starred;
        if (user) updateStarred(upc, newStarred);
        return { ...comic, starred: newStarred };
      }
      return comic;
    }));
  }

  function handleReorder(reorderedComics: Comic[]) {
    setComics(reorderedComics);
    setSortOption('custom'); // Switch to custom when manually reordering

    if (user) {
      const updates = reorderedComics.map((comic, index) => ({
        upc: comic.upc,
        sortOrder: index
      }));
      updateSortOrder(updates);
    }
  }

  function handleFileUpload(comic: Comic) {
    setComics(prev => {
      const isDuplicate = prev.some(c => c.upc === comic.upc);
      if (isDuplicate) {
        return prev; // Don't add duplicate
      }
      const newComic = { ...comic, sortOrder: prev.length };
      if (user) saveToCollection(newComic);
      return [...prev, newComic];
    });
    setError(null);
  }

  // Returns true if added, false if duplicate (for QR scanning)
  function handleQRScan(comic: Comic): boolean {
    const isDuplicate = comics.some(c => c.upc === comic.upc);

    if (isDuplicate) {
      return false;
    } else {
      const newComic = { ...comic, sortOrder: comics.length };
      setComics(prev => [...prev, newComic]);
      setError(null);
      if (user) saveToCollection(newComic);
      return true;
    }
  }

  return (
    <>
      <div className="controls">
        <SearchBar onSearch={handleSearch} />
        <FileUpload onComicFound={handleFileUpload} />
        <QRConnect onComicReceived={handleQRScan} />

        {comics.length > 0 && (
          <div className="controls-row">
            <div className="sort-controls">
              <label htmlFor="sort-select">Sort:</label>
              <select
                id="sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="sort-select"
              >
                <option value="custom">Custom Order</option>
                <option value="a-z">Series A-Z</option>
                <option value="z-a">Series Z-A</option>
              </select>
            </div>
            <button onClick={handleClearAll} className="clear-button">
              Clear All ({comics.length})
            </button>
          </div>
        )}
      </div>

      {loading && <div className="loading">Searching...</div>}
      {error && <div className="error">{error}</div>}

      <ComicGrid
        comics={sortedComics}
        onRemoveComic={handleRemoveComic}
        onToggleStar={handleToggleStar}
        onReorder={handleReorder}
      />
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
