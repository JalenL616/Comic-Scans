import { useState } from 'react'
import type { FormEvent } from 'react'
import './SearchBar.css'

interface SearchBarProps {
  onSearch: (upc: string) => Promise<void>;
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const [upc, setUpc] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (upc.trim()) {
      await onSearch(upc.trim());
      setUpc('');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="search-form">
      <label htmlFor="query" className="visually-hidden">
        Search comics:
      </label>
      <input
        id="query"
        type="text"
        name="query"
        value={upc}
        onChange={(e) => setUpc(e.target.value)}
        placeholder="Enter comic UPC"
      />
      <button type="submit">Search</button>
    </form>
  );
}
