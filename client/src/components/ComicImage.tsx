interface ComicImageProps {
  src: string;
  alt: string;
}

export function ComicImage({ src, alt }: ComicImageProps) {
  return (
    <img 
      src={src} 
      alt={alt}
      className="comic-cover"
    />
  );
}