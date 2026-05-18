import { useEffect, useState } from "react";

export type WindowSizeClass =
  | "expanded"
  | "regular"
  | "compact"
  | "narrow-desktop";

export function resolveWindowSizeClass(width: number): WindowSizeClass {
  if (width >= 1440) {
    return "expanded";
  }
  if (width >= 1100) {
    return "regular";
  }
  if (width >= 820) {
    return "compact";
  }
  return "narrow-desktop";
}

export function useWindowSizeClass() {
  const [sizeClass, setSizeClass] = useState<WindowSizeClass>(() =>
    resolveWindowSizeClass(window.innerWidth),
  );

  useEffect(() => {
    function handleResize() {
      setSizeClass(resolveWindowSizeClass(window.innerWidth));
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return sizeClass;
}
