import { MessageCircle, Plus } from "lucide-react";
import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";
import { ConversationList } from "./ConversationList";
import { IdentityPanel } from "./IdentityPanel";
import { IconButton } from "./ui/IconButton";

export function Sidebar({
  onCreateGroup,
  onConversationOpen,
  onProfileOpen,
  onSettingsOpen,
}: {
  onCreateGroup: () => void;
  onConversationOpen: () => void;
  onProfileOpen: () => void;
  onSettingsOpen: () => void;
}) {
  const language = useChatStore((state) => state.language);
  return (
    <div className="sidebar-inner">
      <header className="sidebar-header">
        <span className="app-mark"><MessageCircle aria-hidden="true" /></span>
        <span className="sidebar-brand">
          <strong>Chatter3</strong>
          <small>{t(language, "app.eyebrow")}</small>
        </span>
        <IconButton
          icon={Plus}
          label={t(language, "conv.createGroup")}
          onClick={onCreateGroup}
        />
      </header>
      <ConversationList onConversationOpen={onConversationOpen} />
      <IdentityPanel onProfileClick={onProfileOpen} onSettingsClick={onSettingsOpen} />
    </div>
  );
}
