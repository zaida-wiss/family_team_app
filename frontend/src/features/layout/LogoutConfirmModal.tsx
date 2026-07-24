import { useState } from "react";
import { LogOut, X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import "./LogoutConfirmModal.css";

type Props = {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

// Logga ut är bara en knapp + en bekräftelsemodal, inte en egen
// inställningssida (2026-07-23, Zaidas önskemål) — ersätter den tidigare
// egna "logout"-underkategorin i SettingsContent.tsx.
export function LogoutConfirmModal({ onCancel, onConfirm }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await onConfirm();
  }

  return (
    <div className="logout-confirm-overlay" onClick={onCancel}>
      <div
        aria-labelledby="logout-confirm-title"
        aria-modal="true"
        className="logout-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="logout-confirm-header">
          <h3 id="logout-confirm-title">Logga ut</h3>
          <button aria-label="Stäng" className="icon-button" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </div>

        <p>Vill du logga ut från Familjeappen?</p>

        <div className="logout-confirm-actions">
          <button className="secondary-button" disabled={loading} onClick={onCancel} type="button">
            Avbryt
          </button>
          <button className="danger-button" disabled={loading} onClick={() => void handleConfirm()} type="button">
            <LogOut size={16} />
            {loading ? "Loggar ut…" : "Logga ut"}
          </button>
        </div>
      </div>
    </div>
  );
}
