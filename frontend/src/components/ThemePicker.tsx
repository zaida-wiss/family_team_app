import { Palette } from "lucide-react";
import { getThemesForAudience } from "../features/members/themes";
import { FONTS, type FontId } from "./FontPicker";
import type { DashboardThemeId, Member } from "@shared/types";

type ThemePickerProps = {
  member: Member;
  onClose: () => void;
  onSelectTheme: (themeId: DashboardThemeId) => void;
  fontId?: FontId;
  onSelectFont?: (fontId: FontId) => void;
};

export function ThemePicker({
  member,
  onClose,
  onSelectTheme,
  fontId,
  onSelectFont,
}: ThemePickerProps) {
  const audience = member.isChild ? "child" : "adult";
  const themes = getThemesForAudience(audience);

  return (
    <div className="theme-picker-backdrop" onClick={onClose}>
      <div className="theme-picker" role="dialog" aria-label="Välj dashboardtema" onClick={(e) => e.stopPropagation()}>
        <div className="theme-picker-header">
          <div>
            <p className="eyebrow">Tema</p>
            <h3>{member.name}</h3>
          </div>
          <Palette size={22} />
        </div>

        <div className="theme-grid">
          {themes.map((theme) => (
            <button
              className={`theme-option theme-${theme.id} ${
                member.dashboardTheme === theme.id ? "active" : ""
              }`}
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

        <button className="secondary-button" onClick={onClose} type="button" style={{ marginTop: "14px" }}>
          Stäng
        </button>
      </div>
    </div>
  );
}
