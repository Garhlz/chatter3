// 桌面能力抽象层：Tauri 环境下走原生 API，浏览器开发时 fallback 到 Web API。
// 这样 npm run dev 远程开发不受影响，打包成 Tauri 应用时自动用原生能力。

let isTauri: boolean | null = null;

export function runningInTauri(): boolean {
  if (isTauri === null) {
    isTauri = "__TAURI_INTERNALS__" in window;
  }
  return isTauri;
}

// ── Token 安全存储 ──

const TOKEN_KEY = "chatter3-jwt";
const STORE_PATH = ".store.dat";

let _storePromise: Promise<unknown> | null = null;

async function getStore() {
  if (!_storePromise) {
    _storePromise = import("@tauri-apps/plugin-store").then((m) =>
      m.load(STORE_PATH),
    );
  }
  return _storePromise;
}

export async function saveToken(token: string): Promise<void> {
  if (runningInTauri()) {
    const store = await getStore();
    await (store as any).set(TOKEN_KEY, token);
    await (store as any).save();
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  if (runningInTauri()) {
    const store = await getStore();
    const value: string | null = (await (store as any).get(TOKEN_KEY)) ?? null;
    if (value) {
      localStorage.setItem(TOKEN_KEY, value);
    }
    return value;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  if (runningInTauri()) {
    const store = await getStore();
    await (store as any).delete(TOKEN_KEY);
    await (store as any).save();
  }
  localStorage.removeItem(TOKEN_KEY);
}

// ── 原生通知 ──

export async function showNotification(
  title: string,
  body: string,
): Promise<void> {
  if (runningInTauri()) {
    const {
      sendNotification,
      requestPermission,
      isPermissionGranted,
    } = await import("@tauri-apps/plugin-notification");
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const result = await requestPermission();
      permissionGranted = result === "granted";
    }
    if (permissionGranted) {
      sendNotification({ title, body });
    }
    return;
  }
  if ("Notification" in window && Notification.permission !== "denied") {
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(title, { body });
    }
  }
}
