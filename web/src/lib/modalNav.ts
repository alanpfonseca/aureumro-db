import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface ModalState {
  backgroundLocation?: ReturnType<typeof useLocation>;
}

/** Hook de navegacao em modal sobre a pagina de fundo.
 *
 *  openModal(to) empilha uma rota de modal reutilizando o MESMO background,
 *  entao voltar (gesto/botao) fecha popup a popup sem perder filtros/scroll.
 */
export function useModalNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as ModalState;
  const inModal = Boolean(state.backgroundLocation);

  const openModal = useCallback(
    (to: string) => {
      navigate(to, {
        state: { backgroundLocation: state.backgroundLocation ?? location },
      });
    },
    [navigate, location, state.backgroundLocation],
  );

  const closeModal = useCallback(() => navigate(-1), [navigate]);

  return useMemo(
    () => ({ openModal, closeModal, inModal }),
    [openModal, closeModal, inModal],
  );
}
