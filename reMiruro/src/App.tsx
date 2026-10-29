import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';
import { useEffect } from 'react';
import {
  Profile,
  Navbar,
  ThemeProvider,
  Footer,
  Home,
  Watch,
  Search,
  Page404,
  About,
  PolicyTerms,
  ShortcutsPopup,
  ScrollToTop,
  usePreserveScrollOnReload,
  Callback,
  ApolloClientProvider,
  Settings,
  SettingsProvider,
} from './index';
import Info from './pages/Info';
import Schedule from './pages/Schedule';
import Trending from './pages/Trending';
import History from './pages/History';
import Announcements from './pages/Announcements';
import { DomainBanner } from './components/Navigation/DomainBanner';
import { register } from 'swiper/element/bundle';
import { AuthProvider } from './client/useAuth';
import ReactGA from 'react-ga4';

register();

function App() {
  usePreserveScrollOnReload();
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;

  useEffect(() => {
    if (measurementId) {
      ReactGA.initialize(measurementId);
    }
  }, [measurementId]);

  return (
    <ApolloClientProvider>
      <Router>
        <AuthProvider>
          <ThemeProvider>
            <SettingsProvider>
              <ShortcutsPopup />
              <ScrollToTop />
              <TrackPageViews />
              <div className='_shell_nq2ct_1'>
                <Navbar />
                <DomainBanner />
                <main className='_content_nq2ct_7'>
                <Routes>
                  <Route path='/' element={<Home />} />
                  <Route path='/home' element={<Home />} />
                  <Route path='/search' element={<Search />} />
                  <Route path='/trending' element={<Trending />} />
                  <Route path='/schedule' element={<Schedule />} />
                  <Route path='/history' element={<History />} />
                  <Route path='/announcements' element={<Announcements />} />
                  <Route path='/info/:animeId' element={<Info />} />
                  <Route path='/info/:animeId/:slug' element={<Info />} />
                  <Route path='/watch/:animeId' element={<Watch />} />
                  <Route path='/watch/:animeId/:slug' element={<Watch />} />
                  <Route
                    path='/watch/:animeId/:animeTitle/:episodeNumber'
                    element={<Watch />}
                  />
                  <Route path='/profile' element={<Profile />} />
                  <Route path='/profile/settings' element={<Settings />} />
                  <Route path='/about' element={<About />} />
                  <Route path='/pptos' element={<PolicyTerms />} />
                  <Route path='/callback' element={<Callback />} />
                  <Route path='*' element={<Page404 />} />
                </Routes>
                </main>
                <Footer />
              </div>
            </SettingsProvider>
          </ThemeProvider>
        </AuthProvider>
      </Router>
    </ApolloClientProvider>
  );
}

function TrackPageViews() {
  const { pathname } = useLocation();

  useEffect(() => {
    ReactGA.send({ hitType: 'pageview', page: pathname });
  }, [pathname]);

  return null;
}

export default App;
