import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import styled from 'styled-components';
import { FaEye, FaThList, FaSearch } from 'react-icons/fa';
import { Episode } from '../../index';

interface Props {
  animeId: string | undefined;
  episodes: Episode[];
  selectedEpisodeId: string;
  onEpisodeSelect: (id: string) => void;
  maxListHeight: string;
}

const ListContainer = styled.div<{ $maxHeight: string }>`
  background-color: transparent;
  color: var(--global-text);
  overflow: hidden;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  max-height: ${({ $maxHeight }) => $maxHeight};
  @media (max-width: 1000px) {
    max-height: 22rem;
  }
`;

const ControlsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0 0.6rem;
`;

const SelectInterval = styled.select`
  background: var(--global-div);
  color: var(--global-text);
  border: none;
  border-radius: 0.7rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.78rem;
`;

const SearchContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--global-div);
  border-radius: 0.7rem;
  padding: 0.4rem 0.65rem;
  color: var(--global-text-muted);
`;

const SearchInput = styled.input`
  border: none;
  background: transparent;
  color: var(--global-text);
  width: 100%;
  outline: none;
  font-size: 0.8rem;
`;

const IconBtn = styled.button`
  border: none;
  background: var(--global-div);
  color: var(--global-text);
  width: 2rem;
  height: 2rem;
  border-radius: 0.7rem;
  display: grid;
  place-items: center;
  cursor: pointer;
`;

const EpisodeGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow-y: auto;
  padding-right: 0.2rem;
`;

const ListItem = styled.button<{ $isSelected: boolean }>`
  display: grid;
  grid-template-columns: 4.4rem 1fr auto;
  gap: 0.65rem;
  align-items: center;
  text-align: left;
  border: none;
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 0.85rem;
  background: ${({ $isSelected }) =>
    $isSelected ? 'var(--primary-accent)' : 'transparent'};
  color: ${({ $isSelected }) => ($isSelected ? '#111' : 'var(--global-text)')};

  &:hover {
    background: ${({ $isSelected }) =>
      $isSelected ? 'var(--primary-accent)' : 'var(--global-div)'};
  }
`;

const Thumb = styled.img`
  width: 4.4rem;
  height: 2.5rem;
  object-fit: cover;
  border-radius: 0.55rem;
  background: var(--global-div);
`;

const Copy = styled.div`
  min-width: 0;
`;

const EpTitle = styled.div`
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const DateText = styled.div`
  font-size: 0.7rem;
  opacity: 0.7;
`;

export const EpisodeList: React.FC<Props> = ({
  animeId,
  episodes,
  selectedEpisodeId,
  onEpisodeSelect,
  maxListHeight,
}) => {
  const episodeGridRef = useRef<HTMLDivElement>(null);
  const episodeRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [interval, setInterval] = useState<[number, number]>([0, 99]);
  const [searchTerm, setSearchTerm] = useState('');
  const [hideSpoilers, setHideSpoilers] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState<Episode[]>([]);
  const [selectionInitiatedByUser, setSelectionInitiatedByUser] =
    useState(false);

  useEffect(() => {
    if (animeId) {
      const watched = localStorage.getItem('watched-episodes');
      if (watched) {
        const watchedEpisodesObject = JSON.parse(watched);
        const watchedEpisodesForAnime = watchedEpisodesObject[animeId];
        if (watchedEpisodesForAnime) {
          setWatchedEpisodes(watchedEpisodesForAnime);
        }
      }
    }
  }, [animeId]);

  const markEpisodeAsWatched = useCallback(
    (id: string) => {
      if (!animeId) return;
      setWatchedEpisodes((prevWatchedEpisodes) => {
        if (prevWatchedEpisodes.some((episode) => episode.id === id)) {
          return prevWatchedEpisodes;
        }
        const selectedEpisode = episodes.find((episode) => episode.id === id);
        if (!selectedEpisode) return prevWatchedEpisodes;
        const updatedWatchedEpisodes = [
          ...prevWatchedEpisodes,
          selectedEpisode,
        ];
        localStorage.setItem(
          'watched-episodes',
          JSON.stringify({
            ...JSON.parse(localStorage.getItem('watched-episodes') || '{}'),
            [animeId]: updatedWatchedEpisodes,
          }),
        );
        return updatedWatchedEpisodes;
      });
    },
    [episodes, animeId],
  );

  const handleEpisodeSelect = useCallback(
    (id: string) => {
      setSelectionInitiatedByUser(true);
      markEpisodeAsWatched(id);
      onEpisodeSelect(id);
    },
    [onEpisodeSelect, markEpisodeAsWatched],
  );

  useEffect(() => {
    if (selectedEpisodeId && !selectionInitiatedByUser) {
      markEpisodeAsWatched(selectedEpisodeId);
    }
  }, [selectedEpisodeId, selectionInitiatedByUser, markEpisodeAsWatched]);

  const intervalOptions = useMemo(() => {
    return episodes.reduce<{ start: number; end: number }[]>(
      (options, _, index) => {
        if (index % 100 === 0) {
          options.push({
            start: index,
            end: Math.min(index + 99, episodes.length - 1),
          });
        }
        return options;
      },
      [],
    );
  }, [episodes]);

  const filteredEpisodes = useMemo(() => {
    const searchQuery = searchTerm.toLowerCase();
    return episodes.filter(
      (episode) =>
        episode.title?.toLowerCase().includes(searchQuery) ||
        episode.number.toString().includes(searchQuery),
    );
  }, [episodes, searchTerm]);

  const displayedEpisodes = useMemo(() => {
    if (!searchTerm) return episodes.slice(interval[0], interval[1] + 1);
    return filteredEpisodes;
  }, [episodes, filteredEpisodes, interval, searchTerm]);

  useEffect(() => {
    if (!selectionInitiatedByUser) {
      const selectedEpisode = episodes.find(
        (episode) => episode.id === selectedEpisodeId,
      );
      if (selectedEpisode) {
        for (const option of intervalOptions) {
          if (
            selectedEpisode.number >= option.start + 1 &&
            selectedEpisode.number <= option.end + 1
          ) {
            setInterval([option.start, option.end]);
            break;
          }
        }
      }
    }
  }, [episodes, selectedEpisodeId, intervalOptions, selectionInitiatedByUser]);

  return (
    <ListContainer $maxHeight={maxListHeight}>
      <ControlsContainer>
        <SelectInterval
          onChange={(e) => {
            const [start, end] = e.target.value.split('-').map(Number);
            setInterval([start, end]);
          }}
          value={`${interval[0]}-${interval[1]}`}
        >
          {intervalOptions.map(({ start, end }, index) => (
            <option key={index} value={`${start}-${end}`}>
              {start + 1}-{end + 1}
            </option>
          ))}
        </SelectInterval>
        <SearchContainer>
          <FaSearch size={12} />
          <SearchInput
            type='text'
            placeholder='Filter episodes...'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchContainer>
        <IconBtn
          onClick={() => setHideSpoilers((value) => !value)}
          aria-label='Hide spoilers'
          title='Hide spoilers'
        >
          <FaEye />
        </IconBtn>
        <IconBtn aria-label='Switch layout'>
          <FaThList />
        </IconBtn>
      </ControlsContainer>
      <EpisodeGrid ref={episodeGridRef}>
        {displayedEpisodes.map((episode) => {
          const $isSelected = episode.id === selectedEpisodeId;
          const watched = watchedEpisodes.some((item) => item.id === episode.id);
          return (
            <ListItem
              key={episode.id}
              $isSelected={$isSelected}
              onClick={() => handleEpisodeSelect(episode.id)}
              aria-selected={$isSelected}
              ref={(el) => {
                episodeRefs.current[episode.id] = el;
              }}
            >
              <Thumb
                src={episode.image}
                alt={`Episode ${episode.number}`}
                style={{ filter: hideSpoilers && !watched ? 'blur(6px)' : 'none' }}
              />
              <Copy>
                <EpTitle>
                  {episode.number}. {episode.title || `Episode ${episode.number}`}
                </EpTitle>
                <DateText>
                  {episode.airDate
                    ? new Date(episode.airDate).toLocaleDateString()
                    : ''}
                </DateText>
              </Copy>
            </ListItem>
          );
        })}
      </EpisodeGrid>
    </ListContainer>
  );
};
