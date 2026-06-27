import { X } from "lucide-react";
import { getThemesForAudience } from "../features/members/themes";
import { FONTS, type FontId } from "./FontPicker";
import type { DashboardThemeId, Member } from "@shared/types";

type ThemePickerProps = {
  member: Member;
  onClose?: () => void;
  onSelectTheme: (themeId: DashboardThemeId) => void;
  fontId?: FontId;
  onSelectFont?: (fontId: FontId) => void;
  /** Hides the floating header/close button — use when embedding inline */
  compact?: boolean;
};

export function ThemePicker({
  member,
  onClose,
  onSelectTheme,
  fontId,
  onSelectFont,
  compact = false,
}: ThemePickerProps) {
  const audience = member.isChild ? "child" : "adult";
  const themes = getThemesForAudience(audience);

  return (
    <div className={compact ? "theme-picker-inline" : "theme-picker"} role={compact ? undefined : "dialog"} aria-label="Välj dashboardtema">
      {!compact && (
        <div className="theme-picker-header">
          <div>
            <p className="eyebrow">Tema</p>
            <h3>{member.name}</h3>
          </div>
          <button className="theme-picker-close" onClick={onClose} type="button" aria-label="Stäng">
            <X size={18} />
          </button>
        </div>
      )}

      <div className="theme-grid">
        {themes.map((theme) => (
          <button
            className={`theme-option theme-${theme.id}${member.dashboardTheme === theme.id ? " active" : ""}`}
            key={theme.id}
            onClick={() => onSelectTheme(theme.id)}
            type="button"
          >
            {theme.name}
          </button>
        ))}
      </div>

      {onSelectFont && fontId !== undefined && (
        <div className="theme-font-section">
          <p className="eyebrow">Typsnitt</p>
          <div className="theme-font-grid">
            {FONTS.map((font) => (
              <button
                key={font.id}
                className={`theme-font-option${fontId === font.id ? " active" : ""}`}
                style={{ "--font-preview": font.display } as React.CSSProperties}
                onClick={() => onSelectFont(font.id)}
                type="button"
                title={font.display}
              >
                <span className="theme-font-preview">Aa</span>
                <span className="theme-font-label">{font.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
