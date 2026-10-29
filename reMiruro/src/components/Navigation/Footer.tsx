import { Link } from 'react-router-dom';
import { Ic, type IconName } from '../../live/Icon';
import { useTheme, type ThemeName } from '../ThemeContext';

const THEMES: { id: ThemeName; icon: IconName }[] = [
  { id: 'system', icon: 'system' },
  { id: 'light', icon: 'light' },
  { id: 'dark', icon: 'dark' },
  { id: 'anilist', icon: 'anilist' },
  { id: 'catppuccin', icon: 'catppuccin' },
];

export function Footer() {
  const { theme, setTheme } = useTheme();
  return (
    <div className='_pageWrapper_1kw42_1' data-is-pwa='false'>
      <footer>
        <div className='_footerBaseContainer_1kw42_18' aria-label='Main Footer' data-sub='false'>
          <p className='_text_1kw42_87' data-issub='false'>
            <img className='_footerLogoImage_1kw42_72 app-icon' alt='' />
            This website does not retain any files on its server. Rather, it solely provides links to media content hosted by third-party services.
          </p>
          <nav className='_linkList_1kw42_41' aria-label='Browse'>
            <Link className='_footerLink_1kw42_48' title='Trending Anime' to='/trending'>
              Trending
            </Link>
            <Link className='_footerLink_1kw42_48' title='Search Anime' to='/search?sort=POPULARITY_DESC'>
              Search
            </Link>
            <Link className='_footerLink_1kw42_48' title='Airing Schedule' to='/schedule'>
              Schedule
            </Link>
          </nav>
          <div className='_linkList_1kw42_41' aria-label='Footer Links'>
            <a className='_footerLink_1kw42_48' title='Domains' href='https://www.miruro.com/#domains' target='_blank'>
              Domains
            </a>
            <a className='_footerLink_1kw42_48' title='Status' href='https://status.miruro.com/status/miruro' target='_blank'>
              Status
            </a>
          </div>
        </div>
        <div className='_footerBaseContainer_1kw42_18' aria-label='Sub Footer' data-sub='true'>
          <p className='_text_1kw42_87' data-issub='true'>
            © {new Date().getFullYear()}{' '}
            <a className='_siteLink_1kw42_111' href='https://www.miruro.com' rel='noopener noreferrer' target='_blank'>
              miruro.com
            </a>{' '}
            | Website by <strong>Miruro no Kuon</strong> <span className='_versionBadge_1kw42_115'>v1.15.8</span>
          </p>
          <div className='_socialThemeContainer_1kw42_128'>
            <div role='radiogroup' aria-label='Theme' className='_group_gvx4x_1 _footer_gvx4x_25'>
              {THEMES.map(({ id, icon }) => {
                const checked = theme === id;
                return (
                  <button
                    key={id}
                    className='_button_gvx4x_9'
                    title={id.toUpperCase()}
                    aria-label={`Switch to ${id} theme`}
                    type='button'
                    role='radio'
                    aria-checked={checked}
                    {...(checked ? { 'data-checked': '' } : { 'data-unchecked': '' })}
                    tabIndex={checked ? 0 : -1}
                    onClick={() => setTheme(id)}
                  >
                    <Ic n={icon} />
                  </button>
                );
              })}
            </div>
            <nav aria-label='Social Links'>
              <div className='_socialIconsWrapper_1kw42_67'>
                <a
                  className='_shareButton_1kw42_142'
                  href='https://www.reddit.com/r/miruro'
                  target='_blank'
                  rel='noopener noreferrer'
                  aria-label='Miruro on Reddit'
                >
                  <Ic n='reddit' />
                </a>
              </div>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Footer;
