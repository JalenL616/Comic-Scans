import { useState } from 'react'
import { SearchBar } from './components/SearchBar'
import { ComicGrid } from './components/ComicGrid'
import { searchComics } from './services/api'
import { FileUpload } from './components/FileUpload'
import type { Comic } from './types/comic'
import './App.css'

function App() {
  const [comics, setComics] = useState<Comic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }

  function handleRemoveComic(upc: string) {
    setComics(prev => prev.filter(comic => comic.upc !== upc));
  }

  function handleFileUpload(comic: Comic) {
    // Check for duplicates
    const isDuplicate = comics.some(c => c.upc === comic.upc);

    if (isDuplicate) {
      setError('Comic already in results');
    } else {
      setComics(prev => [...prev, comic]);
      setError(null);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Comic Scans</h1>
        <SearchBar onSearch={handleSearch} />
        <FileUpload onComicFound={handleFileUpload} />

        {comics.length > 0 && (
          <button onClick={handleClearAll} className="clear-button">
            Clear All ({comics.length})
          </button>
        )}
      </header>

      {loading && <div className="loading">Searching...</div>}
      {error && <div className="error">{error}</div>}
      
      <ComicGrid comics={comics} onRemoveComic={handleRemoveComic} />  
    </div>
  );
}

export default App
