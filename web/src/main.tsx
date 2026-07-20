import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import "./index.css";
import { getDb } from "./lib/db";
import { HomePage } from "./pages/HomePage";
import { ItemPage } from "./pages/ItemPage";
import { HatQuestsPage } from "./pages/HatQuestsPage";
import { MapCollectionsPage } from "./pages/MapCollectionsPage";
import { ItemModal } from "./components/modals/ItemModal";

// Inicia o worker do SQLite ja no boot (paralelo ao primeiro render do React);
// as paginas so aguardam queries, nunca a inicializacao.
void getDb().catch(() => {});

function App() {
  const location = useLocation();
  const state = (location.state ?? {}) as { backgroundLocation?: typeof location };

  return (
    <>
      <Routes location={state?.backgroundLocation ?? location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/item/:id" element={<ItemPage />} />
        <Route path="/hat-quests" element={<HatQuestsPage />} />
        <Route path="/map-collections" element={<MapCollectionsPage />} />
      </Routes>
      {state?.backgroundLocation && (
        <Routes>
          <Route path="/item/:id" element={<ItemModal />} />
        </Routes>
      )}
    </>
  );
}

// HashRouter: o site e 100% estatico. Rotas por hash (#/item/501) funcionam em qualquer
// host sem precisar de rewrite no servidor -- GitHub Pages, Netlify, ou file:// local.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
