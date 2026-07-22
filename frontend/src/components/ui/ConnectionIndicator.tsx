import { LoaderCircle, Wifi, WifiOff } from "lucide-react";
import { statusLabel } from "../../i18n";
import type { Language } from "../../i18n";
import type { RealtimeStatus } from "../../realtime/client";

export function ConnectionIndicator({
  language,
  status,
  compact = false,
}: {
  language: Language;
  status: RealtimeStatus;
  compact?: boolean;
}) {
  const label = statusLabel(language, status);
  const Icon = status === "connected" ? Wifi : status === "connecting" ? LoaderCircle : WifiOff;

  return (
    <span
      className={`connection-indicator connection-${status} ${compact ? "is-compact" : ""}`}
      title={label}
      aria-label={label}
    >
      <Icon className={status === "connecting" ? "spin" : ""} aria-hidden="true" />
      {!compact || status !== "connected" ? <span>{label}</span> : null}
    </span>
  );
}
