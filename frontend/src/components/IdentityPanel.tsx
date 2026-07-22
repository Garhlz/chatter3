import { Settings } from "lucide-react";
import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";
import { Avatar } from "./ui/Avatar";
import { ConnectionIndicator } from "./ui/ConnectionIndicator";
import { IconButton } from "./ui/IconButton";

export function IdentityPanel({
  onProfileClick,
  onSettingsClick,
}: {
  onProfileClick: () => void;
  onSettingsClick: () => void;
}) {
  const language = useChatStore((state) => state.language);
  const currentUser = useChatStore((state) => state.currentUser);
  const status = useChatStore((state) => state.status);

  if (!currentUser) return null;

  return (
    <footer className="user-bar">
      <button type="button" className="user-bar-profile" onClick={onProfileClick}>
        <Avatar user={currentUser} size="small" />
        <span>
          <strong>{currentUser.nickname}</strong>
          <ConnectionIndicator language={language} status={status} compact />
        </span>
      </button>
      <IconButton
        icon={Settings}
        label={t(language, "settings.title")}
        onClick={onSettingsClick}
      />
    </footer>
  );
}
