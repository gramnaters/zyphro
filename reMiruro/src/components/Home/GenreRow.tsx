import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';

const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

const Row = styled.div`
  display: flex;
  gap: 0.55rem;
  overflow-x: auto;
  padding: 0.15rem 0 0.35rem;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Chip = styled.button`
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 0.55rem 0.95rem;
  background: var(--global-div);
  color: var(--global-text);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;

  &:hover {
    background: var(--primary-accent);
    color: #111;
  }
`;

export function GenreRow() {
  const navigate = useNavigate();

  return (
    <Row>
      {GENRES.map((genre) => (
        <Chip
          key={genre}
          onClick={() =>
            navigate(`/search?genres=${encodeURIComponent(genre)}`)
          }
        >
          {genre.toUpperCase()}
        </Chip>
      ))}
    </Row>
  );
}
