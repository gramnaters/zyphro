import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { fetchAiringSchedule } from '../../hooks/useApi';
import { infoPath } from '../../utils/paths';

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const Wrap = styled.section`
  margin-top: 1.5rem;
`;

const Head = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.75rem;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.15rem;
`;

const More = styled(Link)`
  color: var(--global-text-muted);
  font-size: 0.85rem;
  text-decoration: none;
`;

const Days = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.9rem;
`;

const Day = styled.label<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? 'var(--global-div)' : 'transparent'};
  color: ${({ $active }) =>
    $active ? 'var(--primary-accent)' : 'var(--global-text-muted)'};
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;

  input {
    appearance: none;
    margin: 0;
  }
`;

const List = styled.div`
  display: grid;
  gap: 0.45rem;
`;

const Item = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.85rem;
  background: var(--global-div);
  text-decoration: none;
  color: inherit;
`;

const Thumb = styled.img`
  width: 2.1rem;
  height: 2.8rem;
  object-fit: cover;
  border-radius: 0.45rem;
`;

const Meta = styled.div`
  min-width: 0;
  flex: 1;
`;

const Name = styled.div`
  font-size: 0.86rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Time = styled.div`
  font-size: 0.74rem;
  color: var(--global-text-muted);
`;

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function HomeSchedule() {
  const today = new Date().getDay();
  const [day, setDay] = useState(today);
  const [rows, setRows] = useState<any[]>([]);

  const range = useMemo(() => {
    const now = new Date();
    const start = startOfDay(now);
    start.setDate(start.getDate() - now.getDay());
    const from = Math.floor(start.getTime() / 1000);
    const to = from + 7 * 24 * 60 * 60;
    return { from, to };
  }, []);

  useEffect(() => {
    fetchAiringSchedule(range.from, range.to)
      .then(setRows)
      .catch(() => setRows([]));
  }, [range]);

  const filtered = rows.filter((row) => {
    const air = new Date(row.airingAt * 1000);
    return air.getDay() === day;
  });

  return (
    <Wrap>
      <Head>
        <Title>Airing Schedule</Title>
        <More to='/schedule'>show more</More>
      </Head>
      <Days>
        {DAYS.map((label, index) => (
          <Day key={label} $active={day === index}>
            <input
              type='radio'
              name='home-day'
              checked={day === index}
              onChange={() => setDay(index)}
              aria-label={label}
            />
            {label}
          </Day>
        ))}
      </Days>
      <List>
        {filtered.slice(0, 8).map((row) => {
          const title =
            row.media?.title?.english ||
            row.media?.title?.romaji ||
            row.media?.title?.userPreferred;
          const time = new Date(row.airingAt * 1000).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          });
          return (
            <Item
              key={row.id}
              to={infoPath(row.media.id, title)}
            >
              <Thumb
                src={
                  row.media?.coverImage?.large ||
                  row.media?.coverImage?.medium
                }
                alt={title}
              />
              <Meta>
                <Name>{title}</Name>
                <Time>
                  EP {row.episode} · {time}
                </Time>
              </Meta>
            </Item>
          );
        })}
      </List>
    </Wrap>
  );
}
