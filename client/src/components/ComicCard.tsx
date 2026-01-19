import type { Comic } from '../types/comic'
import './ComicCard.css'

interface ComicCardProps {
  comic: Comic;
  onRemove: () => void;
  onToggleStar: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function ComicCard({ comic, onRemove, onToggleStar, onDragStart, onDragEnd }: ComicCardProps) {
  return (
    <div
      className={`comic-card ${comic.starred ? 'starred' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="card-actions">
        <button
          className={`star-button ${comic.starred ? 'starred' : ''}`}
          onClick={onToggleStar}
          aria-label={comic.starred ? 'Unstar comic' : 'Star comic'}
          title={comic.starred ? 'Remove from favorites' : 'Add to favorites'}
        >
          {comic.starred ? '★' : '☆'}
        </button>
        <button
          className="remove-button"
          onClick={onRemove}
          aria-label="Remove comic"
          title="Remove this comic"
        >
          ×
        </button>
      </div>

      <div className="drag-handle" title="Drag to reorder">
        ⋮⋮
      </div>

      <div className="comic-image-container">
        <img
          src={comic.coverImage}
          alt={`${comic.seriesName} #${comic.issueNumber}`}
          className="comic-image"
          onError={(e) => {
            e.currentTarget.src = '/placeholder-comic.png';
          }}
        />
      </div>

      <div className="comic-details">
        <h2 className="comic-title">{comic.name}</h2>
        <p className="comic-info">{comic.seriesName}</p>
        <p className="comic-info">Issue #{comic.issueNumber}</p>
        <p className="comic-info">{comic.seriesYear}</p>
      </div>
    </div>
  );
}
