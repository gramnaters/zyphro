import React, { useEffect, useState, useMemo } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { SkeletonCard, StatusIndicator, type Anime } from '../../index';
import { FaPlay, FaStar } from 'react-icons/fa';
import { TbCards } from 'react-icons/tb';
import { animeTitle, infoPath, watchPath } from '../../utils/paths';

const StyledCardWrapper = styled.div`
  color: var(--global-text);
  animation: slideUp 0.4s ease;
`;

const PosterLink = styled(Link)`
  display: block;
  text-decoration: none;
  color: inherit;
`;

const AnimeImage = styled.div`
  position: relative;
  overflow: hidden;
  border-radius: var(--global-border-radius);
  padding-top: 140%;
  background: var(--global-card-bg);
`;

const PlayIcon = styled(FaPlay)`
  position: absolute;
  top: 50%;
  left: 50%;
  color: #fff;
  transform: translate(-50%, -50%);
  font-size: 1.6rem;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 2;
`;

const EditList = styled.button`
  position: absolute;
  left: 0.5rem;
  bottom: 0.5rem;
  z-index: 3;
  border: none;
  border-radius: 999px;
  padding: 0.3rem 0.65rem;
  font-size: 0.68rem;
  font-weight: 600;
  background: rgba(8, 8, 8, 0.72);
  color: #fff;
  opacity: 0;
  cursor: pointer;
`;

const ImageWrapper = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: filter 0.2s ease;
  }

  &:hover img {
    filter: brightness(0.55);
  }

  &:hover ${PlayIcon}, &:hover ${EditList} {
    opacity: 1;
  }
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.55rem;
`;

const Title = styled.h5`
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 0.86rem;
  font-weight: 600;
`;

const CardDetails = styled.div`
  width: 100%;
  font-size: 0.72rem;
  color: var(--global-text-muted);
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  white-space: nowrap;
  overflow: hidden;
`;

export const CardItem: React.FC<{ anime: Anime }> = ({ anime }) => {
  const [loading, setLoading] = useState(true);
  const title = useMemo(() => animeTitle(anime), [anime]);

  useEffect(() => {
    setLoading(false);
  }, [anime.id]);

  if (loading) return <SkeletonCard />;

  return (
    <StyledCardWrapper>
      <PosterLink
        to={infoPath(anime.id, title)}
        title={title}
      >
        <AnimeImage>
          <ImageWrapper>
            <img
              src={anime.image || ''}
              alt={`${title} Cover Image`}
              loading='eager'
            />
            <PlayIcon
              onClick={(event) => {
                event.preventDefault();
                window.location.assign(watchPath(anime.id, title, 1));
              }}
            />
            <EditList
              type='button'
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              Edit List
            </EditList>
          </ImageWrapper>
        </AnimeImage>
        <TitleRow>
          <StatusIndicator status={anime.status} />
          <Title>{title}</Title>
        </TitleRow>
        <CardDetails>
          {anime.type && <span>{anime.type}</span>}
          {anime.releaseDate && <span>{anime.releaseDate}</span>}
          {anime.totalEpisodes && (
            <span>
              <TbCards style={{ verticalAlign: '-2px' }} /> {anime.totalEpisodes}
            </span>
          )}
          {anime.rating && (
            <span>
              <FaStar style={{ verticalAlign: '-2px' }} /> {anime.rating}
            </span>
          )}
        </CardDetails>
      </PosterLink>
    </StyledCardWrapper>
  );
};
