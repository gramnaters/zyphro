import React, { useState } from 'react';
import styled from 'styled-components';
import {
  FaClosedCaptioning,
  FaDownload,
  FaShare,
  FaBell,
} from 'react-icons/fa';

interface ProviderInfo {
  name: string;
  title?: string | null;
  sub: number;
  dub: number;
}

interface MediaSourceProps {
  sourceType: string;
  setSourceType: (sourceType: string) => void;
  language: string;
  setLanguage: (language: string) => void;
  downloadLink: string;
  episodeId?: string;
  episodeTitle?: string;
  airingTime?: string;
  nextEpisodenumber?: string;
  providers?: ProviderInfo[];
}

const Bar = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-top: 0.85rem;
`;

const TitleBlock = styled.div`
  min-width: 0;
`;

const Title = styled.h3`
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
`;

const Meta = styled.div`
  display: flex;
  gap: 0.7rem;
  color: var(--global-text-muted);
  font-size: 0.78rem;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
`;

const Pill = styled.button<{ $active?: boolean }>`
  border: none;
  border-radius: 999px;
  padding: 0.45rem 0.75rem;
  background: ${({ $active }) =>
    $active ? 'var(--primary-accent)' : 'var(--global-div)'};
  color: ${({ $active }) => ($active ? '#111' : 'var(--global-text)')};
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
`;

const IconLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--global-text);
  text-decoration: none;
  font-size: 0.78rem;
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  background: var(--global-div);
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: none;
  color: var(--global-text);
  font-size: 0.78rem;
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  background: var(--global-div);
  cursor: pointer;
`;

const NextAir = styled.p`
  width: 100%;
  margin: 0.4rem 0 0;
  color: var(--global-text-muted);
  font-size: 0.8rem;
`;

export const MediaSource: React.FC<MediaSourceProps> = ({
  sourceType,
  setSourceType,
  language,
  setLanguage,
  downloadLink,
  episodeId,
  episodeTitle,
  airingTime,
  nextEpisodenumber,
  providers = [],
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const serverCount = Math.max(providers.length, 1);

  return (
    <Bar>
      <TitleBlock>
        <Title>
          {episodeId}. {episodeTitle || `Episode ${episodeId}`}
        </Title>
        <Meta>
          <span>AUDIO</span>
          <span>SERVER ({serverCount})</span>
        </Meta>
      </TitleBlock>
      <Controls>
        <Pill
          $active={language === 'sub'}
          onClick={() => setLanguage(language === 'sub' ? 'dub' : 'sub')}
        >
          <FaClosedCaptioning /> {language === 'sub' ? 'Sub' : 'Dub'}
        </Pill>
        {providers.map((provider) => (
          <Pill
            key={provider.name}
            $active={sourceType === provider.name}
            onClick={() => setSourceType(provider.name)}
          >
            {provider.name}
          </Pill>
        ))}
        {downloadLink && (
          <IconLink href={downloadLink} target='_blank' rel='noreferrer'>
            <FaDownload /> Download
          </IconLink>
        )}
        <IconButton
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 1500);
          }}
        >
          <FaShare /> {isCopied ? 'Copied' : 'Share'}
        </IconButton>
      </Controls>
      {airingTime && (
        <NextAir>
          <FaBell /> Episode {nextEpisodenumber} in {airingTime}
        </NextAir>
      )}
    </Bar>
  );
};
