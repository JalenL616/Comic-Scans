import './ComicCard.css'

interface ComicCardProps {
  comic: {
    name: string;
    seriesName: string;
    issueNumber: string;
    coverImage: string;
    seriesYear: string;
  };
  onRemove: () => void;
}

export function ComicCard({ comic, onRemove }: ComicCardProps) {
  return (
    <div className="comic-card">
      <button
        className="remove-button"
        onClick={onRemove}
        aria-label="Remove comic"
        title="Remove this comic"
      >
        ×
      </button>

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
