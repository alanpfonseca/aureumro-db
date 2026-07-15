import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import { getDb } from "./lib/db";
import { HomePage } from "./pages/HomePage";
import { ItemPage } from "./pages/ItemPage";
import { HatQuestsPage } from "./pages/HatQuestsPage";

// Inicia o worker do SQLite ja no boot (paralelo ao primeiro render do React);
// as paginas so aguardam queries, nunca a inicializacao.
void getDb().catch(() => {});

// HashRouter: o site e 100% estatico. Rotas por hash (#/item/501) funcionam em qualquer
// host sem precisar de rewrite no servidor -- GitHub Pages, Netlify, ou file:// local.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/item/:id" element={<ItemPage />} />
        <Route path="/hat-quests" element={<HatQuestsPage />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
