import { ComicCard } from './ComicCard'
import './ComicGrid.css'

interface Comic {
  upc: string;
  name: string;
  seriesName: string;
  issueNumber: string;
  coverImage: string;
  seriesYear: string;
}

interface ComicGridProps {
  comics: Comic[];
  onRemoveComic: (upc: string) => void;
}

export function ComicGrid({ comics, onRemoveComic }: ComicGridProps) {
  if (comics.length === 0) {
    return null;
  }

  return (
    <div className="comic-grid-container">
      <div className="comic-grid">
        {comics.map((comic) => (
          <ComicCard
            key={comic.upc}
            comic={comic}
            onRemove={() => onRemoveComic(comic.upc)}
          />
        ))}
      </div>
    </div>
  );
}
