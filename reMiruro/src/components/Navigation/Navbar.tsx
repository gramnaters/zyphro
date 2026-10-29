import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Ic } from '../../live/Icon';
import { SideMenu } from './SideMenu';
import { fetchRandomAnimeId } from '../../hooks/useApi';
import { watchHref } from '../../live/parts';

export const Navbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('query') || '');
  const [focused, setFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (pathname !== '/search') setQuery('');
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === '/' && document.activeElement === document.body) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = () => {
    const q = query.trim();
    navigate(q ? `/search?query=${encodeURIComponent(q)}` : '/search?sort=POPULARITY_DESC');
    inputRef.current?.blur();
  };

  const random = async () => {
    const anime = await fetchRandomAnimeId().catch(() => null);
    if (anime) navigate(watchHref(anime));
  };

  return (
    <>
      <div className='_navbar_8b6kj_1' data-scrolled={scrolled ? 'true' : 'false'} tabIndex={-1}>
        <div className='_navbarWrapper_8b6kj_33' tabIndex={-1}>
          <div className='_topContainer_8b6kj_37'>
            <div className='_group_7cruv_1'>
              <button type='button' aria-label='Open Menu' className='_button_1j0r9_1' onClick={() => setMenuOpen(true)}>
                <Ic n='menu' />
              </button>
              <Link title='MIRURO' className='_logo_7cruv_8' to='/'>
                <img alt='MIRUROtv' className='_image_7cruv_31' />
              </Link>
            </div>
            <div className='_section_11eh5_1'>
              <form
                className='_container_yoeus_1'
                data-visible='false'
                role='search'
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <div className='_icon_yoeus_25' data-focused={focused ? 'true' : 'false'}>
                  <Ic n='search' />
                </div>
                <input
                  ref={inputRef}
                  autoComplete='off'
                  spellCheck={false}
                  autoCorrect='off'
                  autoCapitalize='none'
                  role='combobox'
                  aria-expanded='false'
                  aria-haspopup='listbox'
                  aria-autocomplete='list'
                  placeholder='Search Anime'
                  aria-label='Search Anime'
                  className='_input_yoeus_41'
                  type='text'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                />
                <button
                  type='button'
                  tabIndex={-1}
                  data-has-query={query ? 'true' : 'false'}
                  aria-label='Clear Search'
                  className='_clearButton_yoeus_57'
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                >
                  <Ic n='clear' />
                </button>
                <div className='_icon_yoeus_25' data-focused={focused ? 'true' : 'false'}>
                  <Ic n='cmd' />
                </div>
              </form>
              <div className='_actions_11eh5_9'>
                <button type='button' aria-label='Search Anime' className='_button_1j0r9_1' onClick={submit}>
                  <Ic n='search' />
                </button>
                <button type='button' aria-label='Random Anime' className='_button_1j0r9_1' onClick={random}>
                  <Ic n='shuffle' />
                </button>
              </div>
            </div>
            <div className='_rightContent_xvvge_1'>
              <div className='_dropdownAnchor_xvvge_8'>
                <button
                  type='button'
                  aria-haspopup='dialog'
                  aria-expanded='false'
                  aria-label='Profile menu'
                  className='_button_1j0r9_1'
                  onClick={() => navigate('/profile')}
                >
                  <span className='_root_zx33j_1'>
                    <img alt='' className='app-icon _profileFallbackIcon_xvvge_55' />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default Navbar;
