import styled from 'styled-components';
import { Link, useLocation } from 'react-router-dom';
import { FiX } from 'react-icons/fi';
import {
  FiHome,
  FiSearch,
  FiCalendar,
  FiClock,
  FiUser,
  FiTrendingUp,
  FiVolume2,
} from 'react-icons/fi';

const Overlay = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 900;
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  pointer-events: ${({ $open }) => ($open ? 'auto' : 'none')};
  transition: opacity 0.2s ease;
`;

const Drawer = styled.aside<{ $open: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: min(20rem, 86vw);
  background: var(--global-primary-bg);
  z-index: 910;
  transform: translateX(${({ $open }) => ($open ? '0' : '-105%')});
  transition: transform 0.22s ease;
  padding: 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  border-right: 1px solid var(--global-border);
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Brand = styled(Link)`
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: 0.08em;
  text-decoration: none;
  color: var(--global-text);

  span {
    color: var(--primary-accent);
  }
`;

const CloseBtn = styled.button`
  border: none;
  background: var(--global-div);
  color: var(--global-text);
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: pointer;
`;

const NavList = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const Item = styled(Link)<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.85rem;
  text-decoration: none;
  color: ${({ $active }) =>
    $active ? 'var(--primary-accent)' : 'var(--global-text)'};
  background: ${({ $active }) =>
    $active ? 'var(--global-div)' : 'transparent'};
  font-weight: 600;
  font-size: 0.95rem;

  &:hover {
    background: var(--global-div);
  }
`;

const LINKS = [
  { to: '/', label: 'Home', icon: FiHome },
  { to: '/trending', label: 'Trending', icon: FiTrendingUp },
  { to: '/search?sort=POPULARITY_DESC', label: 'Search', icon: FiSearch },
  { to: '/schedule', label: 'Schedule', icon: FiCalendar },
  { to: '/history', label: 'History', icon: FiClock },
  { to: '/announcements', label: 'Announcements', icon: FiVolume2 },
  { to: '/profile', label: 'Profile', icon: FiUser },
];

export function SideMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { pathname } = useLocation();

  return (
    <>
      <Overlay $open={open} onClick={onClose} />
      <Drawer $open={open}>
        <Head>
          <Brand to='/' onClick={onClose}>
            <span>M</span>IRURO
          </Brand>
          <CloseBtn onClick={onClose} aria-label='Close Menu'>
            <FiX />
          </CloseBtn>
        </Head>
        <NavList>
          {LINKS.map(({ to, label, icon: Icon }) => {
            const path = to.split('?')[0];
            return (
              <Item
                key={to}
                to={to}
                $active={pathname === path}
                onClick={onClose}
              >
                <Icon size={18} />
                {label}
              </Item>
            );
          })}
        </NavList>
      </Drawer>
    </>
  );
}
