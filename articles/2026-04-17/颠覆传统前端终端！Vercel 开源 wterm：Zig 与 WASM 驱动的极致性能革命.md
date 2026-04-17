---
title: "颠覆传统前端终端！Vercel 开源 wterm：Zig 与 WASM 驱动的极致性能革命"
date: 2026-04-17
url: "https://mp.weixin.qq.com/s/1va--tTALHLwm35PK2gqUw"
source: "微信公众号"
tags: ["Web Terminal", "WASM", "Zig", "Vercel", "前端"]
---

这篇文章介绍了 Vercel Labs 开源的 Web 终端项目 wterm，并把它定位为对 xterm.js 的一次架构挑战。文章认为，传统 Web 终端虽然性能强，但在文本选择、浏览器查找、无障碍访问和包体积方面存在明显代价。wterm 的核心思路是把终端解析器用 Zig 实现，再编译成一个约 12KB 的 WASM 模块，从而在保持体积很小的同时提高逃逸序列解析效率。为了进一步简化集成，作者提到这个 WASM 资源可以直接 Base64 内联进 JavaScript 包里，尽量做到零配置使用。

在渲染层，wterm 选择回归纯 DOM，而不是继续依赖 Canvas 或 WebGL。文章强调，这样做的直接收益是恢复浏览器原生文本选择、原生查找和屏幕阅读器可访问性。为了避免 DOM 全量重绘带来的性能问题，wterm 使用脏行追踪和 requestAnimationFrame，只更新发生变化的行。文章还提到它对 Unicode 块状字符做了更优雅的处理，通过 CSS 渐变等方式减少字体差异带来的错位问题。

在生态上，wterm 被拆成多个包：@wterm/core 负责底层解析与状态管理，@wterm/dom 负责浏览器渲染，@wterm/react 则提供 React 组件和 Hook 封装。文章认为这种分层让它既能作为底层引擎，也能方便接入现代前端栈。除此之外，wterm 还支持 CSS 变量主题、24 位真彩色、ResizeObserver 自适应和备用屏幕缓冲区，因此可以比较完整地承载 vim、less、htop 这类全屏终端应用。整体来看，这篇文章的主旨是：wterm 试图用“Zig + WASM + DOM”的组合，重新定义轻量、高性能、可访问的 Web 终端实现方式。