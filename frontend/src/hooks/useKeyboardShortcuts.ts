import { useEffect } from "react";
import { useChatStore } from "../store/chatStore";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts() {
  const reconnect = useChatStore((state) => state.reconnect);
  const clearError = useChatStore((state) => state.clearError);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.key.toLowerCase() === "r") {
        event.preventDefault();
        reconnect();
        return;
      }

      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>("[data-private-history-input]")
          ?.focus();
        return;
      }

      if (modifier && event.key.toLowerCase() === "g") {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>("[data-group-name-input]")
          ?.focus();
        return;
      }

      if (event.key === "Escape") {
        clearError();
        if (isEditableTarget(event.target)) {
          (event.target as HTMLElement).blur();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearError, reconnect]);
}
