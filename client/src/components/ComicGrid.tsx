import { useState, useCallback } from 'react'
import { ComicCard } from './ComicCard'
import type { Comic } from '../types/comic'
import './ComicGrid.css'

interface ComicGridProps {
  comics: Comic[];
  onRemoveComic: (upc: string) => void;
  onToggleStar: (upc: string) => void;
  onReorder: (comics: Comic[]) => void;
}

export function ComicGrid({ comics, onRemoveComic, onToggleStar, onReorder }: ComicGridProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  }, [draggedIndex]);

  const handleDragEnd = useCallback(() => {
    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder the comics array
    const newComics = [...comics];
    const [draggedComic] = newComics.splice(draggedIndex, 1);
    newComics.splice(dragOverIndex, 0, draggedComic);

    // Update sort orders
    const reorderedComics = newComics.map((comic, index) => ({
      ...comic,
      sortOrder: index
    }));

    onReorder(reorderedComics);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [comics, draggedIndex, dragOverIndex, onReorder]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  if (comics.length === 0) {
    return null;
  }

  return (
    <div className="comic-grid-container">
      <div className="comic-grid">
        {comics.map((comic, index) => (
          <div
            key={comic.upc}
            className={`comic-grid-item ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
          >
            <ComicCard
              comic={comic}
              onRemove={() => onRemoveComic(comic.upc)}
              onToggleStar={() => onToggleStar(comic.upc)}
              onDragStart={() => handleDragStart(index)}
              onDragEnd={handleDragEnd}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
