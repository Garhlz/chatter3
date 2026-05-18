import { t, type Language } from "../i18n";
import { useChatStore } from "../store/chatStore";
import type { ThemeMode } from "../theme";

export function SettingsModal({
  onClose,
  onOpenDev,
}: {
  onClose: () => void;
  onOpenDev: () => void;
}) {
  const language = useChatStore((state) => state.language);
  const themeMode = useChatStore((state) => state.themeMode);
  const setLanguage = useChatStore((state) => state.setLanguage);
  const setThemeMode = useChatStore((state) => state.setThemeMode);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header">
          <div>
            <p className="section-label">{t(language, "settings.label")}</p>
            <h2>{t(language, "settings.title")}</h2>
          </div>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="settings-body">
          <div className="settings-row">
            <label className="settings-field">
              <span>{t(language, "settings.language")}</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="zh-CN">中文</option>
                <option value="en-US">EN</option>
              </select>
            </label>
          </div>

          <div className="settings-row">
            <label className="settings-field">
              <span>{t(language, "settings.theme")}</span>
              <select
                value={themeMode}
                onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
              >
                <option value="system">{t(language, "theme.system")}</option>
                <option value="latte">{t(language, "theme.latte")}</option>
                <option value="one-dark">{t(language, "theme.oneDark")}</option>
              </select>
            </label>
          </div>

          <div className="settings-divider" />

          <button
            type="button"
            className="secondary-button"
            onClick={() => { onOpenDev(); onClose(); }}
          >
            {t(language, "settings.devPanel")}
          </button>
        </div>
      </div>
    </div>
  );
}
