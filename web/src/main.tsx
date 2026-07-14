import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import { HomePage } from "./pages/HomePage";
import { ItemPage } from "./pages/ItemPage";

// HashRouter: o site e 100% estatico. Rotas por hash (#/item/501) funcionam em qualquer
// host sem precisar de rewrite no servidor -- GitHub Pages, Netlify, ou file:// local.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/item/:id" element={<ItemPage />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
