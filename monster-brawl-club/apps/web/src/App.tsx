import { Navigate, Route, Routes } from 'react-router-dom';
import { GameLayout, Toasts } from './components/Layout';
import { Loading } from './components/ui';
import { SessionProvider, useSession } from './lib/session';
import { Arcade } from './pages/Arcade';
import { Builder } from './pages/Builder';
import { Dojo } from './pages/Dojo';
import { FightLobby } from './pages/FightLobby';
import { FightScreen } from './pages/FightScreen';
import { Friends } from './pages/Friends';
import { FinisherPreview } from './pages/FinisherPreview';
import { Gallery } from './pages/Gallery';
import { Graveyard } from './pages/Graveyard';
import { History } from './pages/History';
import { Landing } from './pages/Landing';
import { MapPage } from './pages/MapPage';
import { Market } from './pages/Market';
import { Monsters } from './pages/Monsters';
import { CardPage, Player } from './pages/Player';
import { Potions } from './pages/Potions';
import { Trader } from './pages/Trader';
import { Village } from './pages/Village';

function Gate() {
  const { me, loading } = useSession();
  if (loading) return <Loading text="Waking the monsters..." />;
  return (
    <Routes>
      <Route path="/gallery" element={<Gallery />} />
      <Route path="/finishers" element={<FinisherPreview />} />
      {!me && <Route path="*" element={<Landing />} />}
      {me && (
        <Route element={<GameLayout />}>
          <Route path="/map" element={<MapPage />} />
          <Route path="/monsters" element={<Monsters />} />
          <Route path="/builder" element={<Builder />} />
          <Route path="/fight" element={<FightLobby />} />
          <Route path="/fight/:id" element={<FightScreen />} />
          <Route path="/village" element={<Village />} />
          <Route path="/village/potions" element={<Potions />} />
          <Route path="/village/dojo" element={<Dojo />} />
          <Route path="/village/market" element={<Market />} />
          <Route path="/village/trader" element={<Trader />} />
          <Route path="/village/arcade" element={<Arcade />} />
          <Route path="/village/graveyard" element={<Graveyard />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/player/:username" element={<Player />} />
          <Route path="/card/:id" element={<CardPage />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Route>
      )}
    </Routes>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Gate />
      <Toasts />
    </SessionProvider>
  );
}
