import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { fetchAiringSchedule } from '../hooks/useApi';
import { infoPath } from '../utils/paths';

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Title = styled.h1`
  font-size: 1.6rem;
  margin: 0.25rem 0 0;
`;

const Controls = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
`;

const Filters = styled.div`
  display: flex;
  gap: 0.4rem;
`;

const Pill = styled.button<{ $active?: boolean }>`
  border: none;
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  background: ${({ $active }) =>
    $active ? 'var(--primary-accent)' : 'var(--global-div)'};
  color: ${({ $active }) => ($active ? '#111' : 'var(--global-text)')};
  font-weight: 600;
  cursor: pointer;
`;

const WeekNav = styled.div`
  display: flex;
  gap: 0.4rem;
`;

const Days = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  font-size: 1.15rem;
  font-weight: 600;
`;

const Day = styled.label<{ $active: boolean }>`
  color: ${({ $active }) =>
    $active ? 'var(--primary-accent)' : 'var(--global-text-muted)'};
  cursor: pointer;

  input {
    appearance: none;
    margin: 0;
  }
`;

const Group = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Hour = styled.h3`
  margin: 0.75rem 0 0;
  color: var(--global-text-muted);
  font-size: 0.95rem;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 0.5rem;
`;

const Card = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.9rem;
  background: var(--global-div);
  text-decoration: none;
  color: inherit;
`;

const Thumb = styled.img`
  width: 2.2rem;
  height: 3rem;
  object-fit: cover;
  border-radius: 0.4rem;
`;

const Name = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
`;

const Meta = styled.div`
  font-size: 0.74rem;
  color: var(--global-text-muted);
`;

function startOfWeek(offset: number) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() + offset * 7);
  return start;
}

const Schedule = () => {
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState(new Date().getDay());
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState<any[]>([]);

  const range = useMemo(() => {
    const start = startOfWeek(week);
    const from = Math.floor(start.getTime() / 1000);
    return { from, to: from + 7 * 24 * 60 * 60, start };
  }, [week]);

  useEffect(() => {
    document.title = 'Airing Schedule · Miruro';
    fetchAiringSchedule(range.from, range.to)
      .then(setRows)
      .catch(() => setRows([]));
  }, [range]);

  const filtered = rows.filter((row) => {
    const air = new Date(row.airingAt * 1000);
    return air.getDay() === day;
  });

  const grouped = filtered.reduce<Record<string, any[]>>((acc, row) => {
    const key = new Date(row.airingAt * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    acc[key] = acc[key] || [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <Page>
      <Title>Anime Airing Schedule</Title>
      <Controls>
        <Filters>
          {['all', 'raw', 'sub', 'dub'].map((item) => (
            <Pill
              key={item}
              $active={filter === item}
              onClick={() => setFilter(item)}
            >
              {item.toUpperCase()}
            </Pill>
          ))}
        </Filters>
        <WeekNav>
          <Pill onClick={() => setWeek((value) => value - 1)} aria-label='Previous week'>
            ‹
          </Pill>
          <Pill
            $active={week === 0}
            disabled={week === 0}
            onClick={() => setWeek(0)}
          >
            Today
          </Pill>
          <Pill onClick={() => setWeek((value) => value + 1)} aria-label='Next week'>
            ›
          </Pill>
        </WeekNav>
      </Controls>
      <Days>
        {DAYS.map((label, index) => (
          <Day key={label} $active={day === index}>
            <input
              type='radio'
              name='schedule-day'
              checked={day === index}
              onChange={() => setDay(index)}
              aria-label={label}
            />
            {label}
          </Day>
        ))}
      </Days>
      {Object.keys(grouped).length === 0 && (
        <p style={{ color: 'var(--global-text-muted)' }}>
          No airing titles for this day.
        </p>
      )}
      {Object.entries(grouped).map(([hour, items]) => (
        <Group key={hour}>
          <Hour>{hour}</Hour>
          <Row>
            {items.map((row) => {
              const title =
                row.media?.title?.english ||
                row.media?.title?.romaji ||
                row.media?.title?.userPreferred;
              return (
                <Card key={row.id} to={infoPath(row.media.id, title)}>
                  <Thumb
                    src={
                      row.media?.coverImage?.large ||
                      row.media?.coverImage?.medium
                    }
                    alt={title}
                  />
                  <div>
                    <Name>{title}</Name>
                    <Meta>
                      EP {row.episode} · {hour}
                    </Meta>
                  </div>
                </Card>
              );
            })}
          </Row>
        </Group>
      ))}
    </Page>
  );
};

export default Schedule;
