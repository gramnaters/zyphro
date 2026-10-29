import { useEffect } from 'react';
import styled from 'styled-components';

const Page = styled.div`
  max-width: 46rem;
`;

const Card = styled.article`
  background: var(--global-div);
  border-radius: 1rem;
  padding: 1.1rem 1.2rem;
  margin-bottom: 0.8rem;
`;

const Announcements = () => {
  useEffect(() => {
    document.title = 'Announcements · Miruro';
  }, []);

  return (
    <Page>
      <h1>Announcements</h1>
      <Card>
        <strong>You&apos;re on the correct domain.</strong>
        <p>miruro.cx is our primary domain. Bookmark this address.</p>
      </Card>
      <Card>
        <strong>Local streams use Anivexa providers.</strong>
        <p>
          Playback stays on AniList IDs through the local shim. Provider
          switching is available on the watch page.
        </p>
      </Card>
    </Page>
  );
};

export default Announcements;
