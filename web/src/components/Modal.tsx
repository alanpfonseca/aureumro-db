import { useEffect, useLayoutEffect, useRef } from "react";

interface Props {
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}

export function Modal({ onClose, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<Element | null>(null);

  // Scroll lock: guarda o overflow anterior e restaura no cleanup (safe p/ StrictMode).
  useLayoutEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Foco no container ao abrir; devolve o foco ao elemento anterior ao fechar.
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    return () => {
      const el = prevFocusRef.current;
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    };
  }, []);

  // Escape fecha o modal.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
