import { ChevronDown } from "lucide-react";
import { useState } from "react";
import "./SettingsSection.css";

type Props = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function SettingsSection({ title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`settings-section${open ? " settings-section--open" : ""}`}>
      <button
        className="settings-section-btn"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span>{title}</span>
        <ChevronDown className="settings-chevron" size={18} />
      </button>
      <div className="settings-section-body">
        <div className="settings-section-inner">
          {children}
        </div>
      </div>
    </div>
  );
}
