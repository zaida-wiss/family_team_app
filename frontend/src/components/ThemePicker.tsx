import { Palette } from "lucide-react";
import { getThemesForAudience } from "../features/members/themes";
import type { DashboardThemeId, Member } from "@shared/types";

type ThemePickerProps = {
  member: Member;
  onClose: () => void;
  onSelectTheme: (themeId: DashboardThemeId) => void;
};

export function ThemePicker({
  member,
  onClose,
  onSelectTheme
}: ThemePickerProps) {
  const audience = member.isChild ? "child" : "adult";
  const themes = getThemesForAudience(audience);

  return (
    <div className="theme-picker" role="dialog" aria-label="Välj dashboardtema">
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

      <button className="secondary-button" onClick={onClose} type="button">
        Stäng
      </button>
    </div>
  );
}
