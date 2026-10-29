import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { animeTitle, watchPath } from '../utils/paths';

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
`;

const Item = styled(Link)`
  display: flex;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-radius: 1rem;
  background: var(--global-div);
  text-decoration: none;
  color: inherit;
`;

const History = () => {
  const [items, setItems] = useState<
    { id: string; title: string; episode: number }[]
  >([]);

  useEffect(() => {
    document.title = 'Watch History · Miruro';
    const saved = JSON.parse(localStorage.getItem('miruro:history') || '[]');
    const rows = (Array.isArray(saved) ? saved : [])
      .map((value: any) => ({
        id: String(value.id),
        title: typeof value.title === 'string' ? value.title : animeTitle(value),
        episode: Number(value.episode) || 1,
        timestamp: value.at || 0,
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
    setItems(rows);
  }, []);

  return (
    <Page>
      <Title>History</Title>
      {items.length === 0 && <p>No watch history yet.</p>}
      {items.map((item) => (
        <Item key={item.id} to={watchPath(item.id, item.title, item.episode)}>
          <span>{item.title}</span>
          <span>Continue</span>
        </Item>
      ))}
    </Page>
  );
};

export default History;
