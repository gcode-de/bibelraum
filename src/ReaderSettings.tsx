import { ALargeSmall, AlignJustify, AlignLeft, Check, Minus, Plus, RotateCcw, X } from 'lucide-react';

export type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  fontFamily: 'book' | 'classic' | 'sans';
  accent: 'terracotta' | 'blue' | 'green';
  highlight: HighlightColor;
  textWidth: 'narrow' | 'medium' | 'wide';
  textAlign: 'left' | 'justify';
};

export type HighlightColor = 'yellow' | 'orange' | 'rose' | 'purple' | 'blue' | 'green';

export const highlightChoices: Array<{ id: HighlightColor; name: string }> = [
  { id: 'yellow', name: 'Gelb' },
  { id: 'orange', name: 'Orange' },
  { id: 'rose', name: 'Rosa' },
  { id: 'purple', name: 'Violett' },
  { id: 'blue', name: 'Blau' },
  { id: 'green', name: 'Grün' },
];

export type ReaderTheme = 'light' | 'sepia' | 'gray' | 'dark' | 'black';

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 20,
  lineHeight: 1.73,
  fontFamily: 'book',
  accent: 'terracotta',
  highlight: 'yellow',
  textWidth: 'medium',
  textAlign: 'left',
};

export const readerFontStacks: Record<ReaderSettings['fontFamily'], string> = {
  book: "Iowan Old Style, Palatino Linotype, Georgia, serif",
  classic: "Georgia, Times New Roman, serif",
  sans: "Inter, Avenir, Helvetica Neue, Arial, sans-serif",
};

const fontChoices: Array<{
  id: ReaderSettings['fontFamily'];
  name: string;
  sample: string;
}> = [
  { id: 'book', name: 'Buchschrift', sample: 'Am Anfang' },
  { id: 'classic', name: 'Klassisch', sample: 'Am Anfang' },
  { id: 'sans', name: 'Serifenlos', sample: 'Am Anfang' },
];

const themeChoices: Array<{ id: ReaderTheme; name: string }> = [
  { id: 'light', name: 'Hell' },
  { id: 'sepia', name: 'Sepia' },
  { id: 'gray', name: 'Grau' },
  { id: 'dark', name: 'Nacht' },
  { id: 'black', name: 'OLED' },
];

export function loadReaderSettings(): ReaderSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('bibelraum.reader-settings') ?? '{}') as Partial<ReaderSettings>;
    const fontFamily = saved.fontFamily && Object.hasOwn(readerFontStacks, saved.fontFamily)
      ? saved.fontFamily
      : defaultReaderSettings.fontFamily;
    return {
      fontSize: clamp(Number(saved.fontSize) || defaultReaderSettings.fontSize, 16, 30),
      lineHeight: clamp(Number(saved.lineHeight) || defaultReaderSettings.lineHeight, 1.35, 2.1),
      fontFamily,
      accent: saved.accent === 'blue' || saved.accent === 'green' ? saved.accent : 'terracotta',
      highlight: highlightChoices.some((choice) => choice.id === saved.highlight)
        ? saved.highlight as HighlightColor
        : 'yellow',
      textWidth: saved.textWidth === 'narrow' || saved.textWidth === 'wide' ? saved.textWidth : 'medium',
      textAlign: saved.textAlign === 'justify' ? 'justify' : 'left',
    };
  } catch {
    return defaultReaderSettings;
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function ReaderSettingsPanel({ settings, theme, onChange, onThemeChange, onClose }: {
  settings: ReaderSettings;
  theme: ReaderTheme;
  onChange: (settings: ReaderSettings) => void;
  onThemeChange: (theme: ReaderTheme) => void;
  onClose: () => void;
}) {
  function update<Key extends keyof ReaderSettings>(key: Key, value: ReaderSettings[Key]) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <section className="reader-settings-panel" role="dialog" aria-modal="true" aria-labelledby="reader-settings-title">
      <div className="settings-handle" aria-hidden="true" />
      <header className="settings-heading">
        <div>
          <span className="eyebrow">Persönliche Darstellung</span>
          <h2 id="reader-settings-title">Leseansicht</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Leseansicht schließen">
          <X size={19} />
        </button>
      </header>

      <div
        className="settings-preview"
        style={{
          fontFamily: readerFontStacks[settings.fontFamily],
          fontSize: `${Math.min(settings.fontSize, 23)}px`,
          lineHeight: settings.lineHeight,
        }}
      >
        <sup>16</sup> Denn also hat Gott die Welt geliebt.
      </div>

      <div className="settings-group appearance-group">
        <div className="settings-label"><span>Farbprofil</span></div>
        <div className="theme-choices">
          {themeChoices.map((choice) => (
            <button
              className={`${choice.id} ${theme === choice.id ? 'selected' : ''}`}
              onClick={() => onThemeChange(choice.id)}
              aria-pressed={theme === choice.id}
              key={choice.id}
            >
              <i><span /></i>
              <small>{choice.name}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group color-settings">
        <div>
          <span>Akzentfarbe</span>
          <div className="color-choices">
            {(['terracotta', 'blue', 'green'] as const).map((color) => (
              <button className={`${color} ${settings.accent === color ? 'selected' : ''}`} onClick={() => update('accent', color)} aria-label={`Akzent ${color}`} aria-pressed={settings.accent === color} key={color} />
            ))}
          </div>
        </div>
        <div>
          <span>Markierungen</span>
          <div className="color-choices highlight-choices">
            {highlightChoices.map((color) => (
              <button className={`${color.id} ${settings.highlight === color.id ? 'selected' : ''}`} onClick={() => update('highlight', color.id)} aria-label={`${color.name} als Standardfarbe`} aria-pressed={settings.highlight === color.id} title={color.name} key={color.id} />
            ))}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-label">
          <span><ALargeSmall size={17} /> Schriftgröße</span>
          <output>{settings.fontSize} px</output>
        </div>
        <div className="font-size-control">
          <button
            onClick={() => update('fontSize', clamp(settings.fontSize - 1, 16, 30))}
            disabled={settings.fontSize <= 16}
            aria-label="Schrift verkleinern"
          >
            <Minus size={18} />
          </button>
          <input
            type="range"
            min="16"
            max="30"
            step="1"
            value={settings.fontSize}
            onChange={(event) => update('fontSize', Number(event.target.value))}
            aria-label="Schriftgröße"
          />
          <button
            onClick={() => update('fontSize', clamp(settings.fontSize + 1, 16, 30))}
            disabled={settings.fontSize >= 30}
            aria-label="Schrift vergrößern"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="settings-group reading-layout-settings">
        <div>
          <div className="settings-label"><span>Textbreite</span></div>
          <div className="segmented-control three-options">
            {([
              ['narrow', 'Schmal'],
              ['medium', 'Mittel'],
              ['wide', 'Breit'],
            ] as const).map(([value, label]) => (
              <button className={settings.textWidth === value ? 'selected' : ''} onClick={() => update('textWidth', value)} key={value}>{label}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="settings-label"><span>Textausrichtung</span></div>
          <div className="segmented-control">
            <button className={settings.textAlign === 'left' ? 'selected' : ''} onClick={() => update('textAlign', 'left')}><AlignLeft size={15} /> Flattersatz</button>
            <button className={settings.textAlign === 'justify' ? 'selected' : ''} onClick={() => update('textAlign', 'justify')}><AlignJustify size={15} /> Blocksatz</button>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-label">
          <span>Zeilenabstand</span>
          <output>{settings.lineHeight.toFixed(2).replace('.', ',')}</output>
        </div>
        <input
          className="line-height-slider"
          type="range"
          min="1.35"
          max="2.1"
          step="0.05"
          value={settings.lineHeight}
          onChange={(event) => update('lineHeight', Number(event.target.value))}
          aria-label="Zeilenabstand"
        />
        <div className="range-labels" aria-hidden="true"><span>Kompakt</span><span>Weit</span></div>
      </div>

      <div className="settings-group">
        <div className="settings-label"><span>Schriftart</span></div>
        <div className="font-choices">
          {fontChoices.map((choice) => (
            <button
              className={settings.fontFamily === choice.id ? 'selected' : ''}
              onClick={() => update('fontFamily', choice.id)}
              key={choice.id}
            >
              <span style={{ fontFamily: readerFontStacks[choice.id] }}>{choice.sample}</span>
              <small>{choice.name}</small>
              {settings.fontFamily === choice.id && <i><Check size={12} /></i>}
            </button>
          ))}
        </div>
      </div>

      <button className="settings-reset" onClick={() => { onChange(defaultReaderSettings); onThemeChange('light'); }}>
        <RotateCcw size={14} /> Standardeinstellungen
      </button>
    </section>
  );
}
