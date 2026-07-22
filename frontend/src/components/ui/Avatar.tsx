import type { CurrentUser } from "../../protocol";
import { resolveAPIResourceURL } from "../../desktop";

type AvatarUser = Pick<CurrentUser, "username" | "nickname" | "avatarUrl">;

export function Avatar({
  user,
  size = "medium",
  online,
}: {
  user: AvatarUser;
  size?: "small" | "medium" | "large";
  online?: boolean;
}) {
  const fallback = (user.nickname || user.username).trim().slice(0, 1).toUpperCase();

  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {user.avatarUrl ? (
        <img src={resolveAPIResourceURL(user.avatarUrl)} alt="" />
      ) : (
        <span className="avatar-fallback">{fallback || "?"}</span>
      )}
      {online !== undefined ? (
        <span className={`avatar-presence ${online ? "is-online" : "is-offline"}`} />
      ) : null}
    </span>
  );
}
