import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

export function IconButton({
  icon: Icon,
  label,
  size = "medium",
  className = "",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  size?: "small" | "medium";
}) {
  return (
    <button
      type="button"
      className={`icon-button icon-button-${size} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...buttonProps}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}
