import { X } from "lucide-react";
import { getThemesForAudience } from "../features/members/themes";
import { FONTS, type FontId } from "./FontPicker";
import type { DashboardThemeId, Member } from "@shared/types";
import { useModalA11y } from "../hooks/useModalA11y";

type ThemePickerProps = {
  member: Member;
  onClose?: () => void;
  onSelectTheme: (themeId: DashboardThemeId) => void;
  // Mörkt läge (2026-07-23) — bara relevant för vuxenteman, se ThemePickerBody.
  onToggleDarkMode?: (darkMode: boolean) => void;
  fontId?: FontId;
  onSelectFont?: (fontId: FontId) => void;
  /** Hides the floating header/close button — use when embedding inline */
  compact?: boolean;
};

export function ThemePicker({ member, onClose, onSelectTheme, onToggleDarkMode, fontId, onSelectFont, compact = false }: ThemePickerProps) {
  return compact
    ? (
        <ThemePickerBody
          member={member}
          onSelectTheme={onSelectTheme}
          onToggleDarkMode={onToggleDarkMode}
          fontId={fontId}
          onSelectFont={onSelectFont}
          compact
        />
      )
    : (
        <ThemePickerFloating
          member={member}
          onClose={onClose ?? (() => {})}
          onSelectTheme={onSelectTheme}
          onToggleDarkMode={onToggleDarkMode}
          fontId={fontId}
          onSelectFont={onSelectFont}
        />
      );
}

function ThemePickerFloating({
  member,
  onClose,
  onSelectTheme,
  onToggleDarkMode,
  fontId,
  onSelectFont,
}: Omit<ThemePickerProps, "compact" | "onClose"> & { onClose: () => void }) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div className="theme-picker" role="dialog" aria-modal="true" aria-labelledby="theme-picker-title" ref={dialogRef}>
      <div className="theme-picker-header">
        <div>
          <p className="eyebrow">Tema</p>
          <h3 id="theme-picker-title">{member.name}</h3>
        </div>
        <button className="theme-picker-close" onClick={onClose} type="button" aria-label="Stäng">
          <X size={18} />
        </button>
      </div>
      <ThemePickerBody member={member} onSelectTheme={onSelectTheme} onToggleDarkMode={onToggleDarkMode} fontId={fontId} onSelectFont={onSelectFont} />
    </div>
  );
}

function ThemePickerBody({
  member,
  onSelectTheme,
  onToggleDarkMode,
  fontId,
  onSelectFont,
  compact = false,
}: Omit<ThemePickerProps, "onClose">) {
  const audience = member.isChild ? "child" : "adult";
  const themes = getThemesForAudience(audience);

  const grid = (
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
  );

  // Mörkt läge (2026-07-23, Zaidas önskemål: "fortfarande samma tema, men
  // med omvänd färgordning, ljusa färger byter plats med mörka") — bara
  // vuxenteman, en oberoende på/av-växel ovanpå det valda temat.
  const darkModeSection = !member.isChild && onToggleDarkMode && (
    <label className="theme-dark-mode-toggle">
      <span>Mörkt läge</span>
      <input
        checked={member.darkMode ?? false}
        onChange={(e) => onToggleDarkMode(e.target.checked)}
        type="checkbox"
      />
    </label>
  );

  const fontSection = onSelectFont && fontId !== undefined && (
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
  );

  return compact
    ? (
        <div className="theme-picker-inline">
          {grid}
          {darkModeSection}
          {fontSection}
        </div>
      )
    : (
        <>
          {grid}
          {darkModeSection}
          {fontSection}
        </>
      );
}
