import { X } from "lucide-react";
import { getThemesForAudience } from "../features/members/themes";
import { FONTS, type FontId } from "./FontPicker";
import type { DashboardThemeId, Member, TextSize } from "@shared/types";
import { useModalA11y } from "../hooks/useModalA11y";

const TEXT_SIZE_OPTIONS: { id: TextSize; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "large", label: "Stor" },
  { id: "extra-large", label: "Extra stor" }
];

type ThemePickerProps = {
  member: Member;
  onClose?: () => void;
  onSelectTheme: (themeId: DashboardThemeId) => void;
  // Mörkt läge (2026-07-23) — bara relevant för vuxenteman, se ThemePickerBody.
  onToggleDarkMode?: (darkMode: boolean) => void;
  // Textstorlek (2026-07-25, Zaidas önskemål om bättre tillgänglighet för
  // äldre) — gäller alla medlemmar, till skillnad från Mörkt läge.
  onSelectTextSize?: (textSize: TextSize) => void;
  // Enhetsspecifik override (2026-08-10) — textSize är den EFFEKTIVA
  // storleken just nu (override om satt, annars member.textSize), inte
  // nödvändigtvis samma som member.textSize.
  textSize?: TextSize;
  deviceTextSizeOverride?: boolean;
  onToggleDeviceTextSize?: (enabled: boolean) => void;
  fontId?: FontId;
  onSelectFont?: (fontId: FontId) => void;
  /** Hides the floating header/close button — use when embedding inline */
  compact?: boolean;
};

export function ThemePicker({ member, onClose, onSelectTheme, onToggleDarkMode, onSelectTextSize, textSize, deviceTextSizeOverride, onToggleDeviceTextSize, fontId, onSelectFont, compact = false }: ThemePickerProps) {
  return compact
    ? (
        <ThemePickerBody
          member={member}
          onSelectTheme={onSelectTheme}
          onToggleDarkMode={onToggleDarkMode}
          onSelectTextSize={onSelectTextSize}
          textSize={textSize}
          deviceTextSizeOverride={deviceTextSizeOverride}
          onToggleDeviceTextSize={onToggleDeviceTextSize}
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
          onSelectTextSize={onSelectTextSize}
          textSize={textSize}
          deviceTextSizeOverride={deviceTextSizeOverride}
          onToggleDeviceTextSize={onToggleDeviceTextSize}
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
  onSelectTextSize,
  textSize,
  deviceTextSizeOverride,
  onToggleDeviceTextSize,
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
      <ThemePickerBody
        member={member}
        onSelectTheme={onSelectTheme}
        onToggleDarkMode={onToggleDarkMode}
        onSelectTextSize={onSelectTextSize}
        textSize={textSize}
        deviceTextSizeOverride={deviceTextSizeOverride}
        onToggleDeviceTextSize={onToggleDeviceTextSize}
        fontId={fontId}
        onSelectFont={onSelectFont}
      />
    </div>
  );
}

function ThemePickerBody({
  member,
  onSelectTheme,
  onToggleDarkMode,
  onSelectTextSize,
  textSize,
  deviceTextSizeOverride,
  onToggleDeviceTextSize,
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

  // Textstorlek (2026-07-25) — tre knappar, samma togglemönster som redan
  // används på flera ställen i appen (t.ex. RecurrencePicker.css:s
  // veckodagar) istället för en fri slider. Enhetsspecifik override
  // (2026-08-10, Zaidas önskemål) — "textSize" är den EFFEKTIVA storleken
  // (override om den här enheten har en, annars kontots värde för member),
  // och en egen växel avgör vart ett val skrivs.
  const effectiveTextSize = textSize ?? member.textSize ?? "normal";
  const textSizeSection = onSelectTextSize && (
    <div className="theme-text-size-section">
      <p className="eyebrow">Textstorlek</p>
      <div className="theme-text-size-grid">
        {TEXT_SIZE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            aria-pressed={effectiveTextSize === opt.id}
            className={`theme-text-size-option${effectiveTextSize === opt.id ? " active" : ""}`}
            onClick={() => onSelectTextSize(opt.id)}
            type="button"
          >
            {opt.label}
          </button>
        ))}
      </div>
      {onToggleDeviceTextSize && (
        <label className="theme-text-size-device-toggle">
          <span>Bara på den här enheten</span>
          <input
            checked={deviceTextSizeOverride ?? false}
            onChange={(e) => onToggleDeviceTextSize(e.target.checked)}
            type="checkbox"
          />
        </label>
      )}
    </div>
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
            data-font-id={font.id}
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
          {textSizeSection}
          {fontSection}
        </div>
      )
    : (
        <>
          {grid}
          {darkModeSection}
          {textSizeSection}
          {fontSection}
        </>
      );
}
