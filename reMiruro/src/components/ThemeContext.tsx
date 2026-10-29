import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

export type ThemeName =
  | 'system'
  | 'light'
  | 'dark'
  | 'anilist'
  | 'catppuccin';

type ThemeContextType = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => useContext(ThemeContext)!;

type ThemeProviderProps = {
  children: ReactNode;
};

function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const resolved =
    theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme;
  for (const t of ['light', 'dark', 'anilist', 'catppuccin']) {
    root.classList.toggle(`${t}-mode`, t === resolved);
  }
  root.style.backgroundColor = '';
}

function readStoredTheme(): ThemeName {
  let stored: unknown = null;
  try {
    stored = JSON.parse(localStorage.getItem('miruro:settings:theme') || 'null');
  } catch {
    stored = null;
  }
  if (
    stored === 'system' ||
    stored === 'light' ||
    stored === 'dark' ||
    stored === 'anilist' ||
    stored === 'catppuccin'
  ) {
    return stored;
  }
  return 'dark';
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setThemeState] = useState<ThemeName>(() => readStoredTheme());
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDarkMode =
    theme === 'dark' ||
    theme === 'anilist' ||
    theme === 'catppuccin' ||
    (theme === 'system' && prefersDark);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('miruro:settings:theme', JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (theme === 'system') applyTheme('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
