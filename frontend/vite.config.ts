import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendTarget =
  process.env.CHATTER_HTTP_PROXY_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    // 远程开发时，把 dev server 绑定到 0.0.0.0 更稳。
    // 否则某些端口转发/远程 IDE 场景下，浏览器连不到页面本身，
    // 问题甚至还没进入“前端能否请求后端”这一步。
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
    proxy: {
      // 远程开发时，浏览器里的 127.0.0.1 指向的是“本机”，不是远程 Linux。
      // 因此前端默认不要直接请求 http://127.0.0.1:8080，
      // 而是统一请求相对 /api，再交给 Vite dev server 代转到后端。
      //
      // 这样做的直接收益是：
      // - 浏览器只需要访问一个前端端口
      // - 远程端口转发时更稳定
      // - 页面代码不再感知“后端到底跑在本地、远程还是别的主机”
      "/api": {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  envPrefix: ["VITE_", "CHATTER_"],
});
