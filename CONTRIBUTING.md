# 参与开发

欢迎提 Issue 和 PR。流程是普通的 fork 加 PR：

```sh
git clone https://github.com/<你的用户名>/KeyCat.git
cd KeyCat && git switch -c <分支名>
```

改完推到你的 fork，向 `ElloboDK/KeyCat` 的 `main` 开 PR。第一次提 PR 时 CLA 机器人会在 PR 下留言，读一下 [CLA.md](CLA.md)，同意的话按它的提示回复那句话就签好了，以后的 PR 不用再签。签了 CLA，你仍保留自己代码的版权。

## 本地开发

| 改什么 | 需要 | 怎么跑 |
|---|---|---|
| `web/`（猫、键盘、动作，各平台共用） | Python 3 | `python3 tools/serve.py`，浏览器打开 <http://127.0.0.1:8765/index.html?dev> |
| `mac/` | macOS 13+、Xcode 命令行工具 | `sh mac/build.sh && open build/KeyCat.app` |
| `win/` | Node.js 22+、Rust | `cd win && npm ci && npm start`（macOS 上也能跑起来调试，打安装包要在 Windows 上 `npm run dist`） |
| `linux/` | Node.js 22+、Rust | `cd linux && npm ci && npm run input && npm start`（macOS 上也能跑起来调试，只是收不到全局按键；`npm run check` 把菜单点一遍检查效果，打安装包要在 Linux 上 `npm run dist`） |
| `site/`（下载页） | Node.js 22+ | `node tools/site/build.js`，产物在 `_site/` |

页面地址加 `?dev` 后，控制台里的 `cat.freeze()`、`cat.step(秒)`、`cat.test(名字)` 可以停住时间、逐帧推进、播放某个动作，方便截图对比。

mac 版第一次构建时会在 `signing/` 生成一张只属于你这台机器的证书，用来保持「输入监控」授权。它和正式发布用的证书不是一张，不要提交 `signing/`。本地的 mac 版和装在「应用程序」里的正式版共用设置（defaults 域 `com.local.keycat`），调试时注意别把设置改乱。

## 改代码时守住的约束

- **隐私**：外壳只把「哪个键按下 / 抬起」传给页面，记忆只存次数和时长。不记录、不持久化、不外传具体按键。
- **各端同步**：菜单项、设置键名、默认值、`cat.options` 字段在 mac、Windows、Linux 三端一致，`win/src/main.rs` 是照着 `mac/App.swift`、`mac/AppMenu.swift` 写的，`linux/src/main.js` 又是照着 `win/src/main.rs` 写的。改一端通常要改另外两端。
- **`web/` 不分平台**：页面只用 `window.webkit.messageHandlers` 和 `KeyboardEvent.code`，平台差异放在外壳。新增网页到外壳的消息，三端的 `catMessage` / `on_cat_message` / `onCatMessage` 都要处理。
- **可调参数只在 `web/tuning.js` 定义**：外壳只存与默认值不同的项，改默认值会影响所有没改过这项的用户。
- **记忆兼容**：`web/life.js` 的 `load()` 只认已知字段，加字段要加进 `DAY_FIELDS`，旧数据缺的按 0。
- **打包范围**：mac 和 Linux 只拷 `web/*.html`、`web/*.js`、`THREE_LICENSE`；下载页只拷 `web/index.html` 和它 `<script src>` 引用的文件，新脚本要写进这个列表。

## PR 检查

PR 会自动跑这些检查（第一次在本仓库提 PR 的话，可能要等维护者批准后才会运行）：

- 改了 `mac/` 或 `web/`：在 macOS 上构建 mac 版。
- 改了 `win/` 或 `web/`：在 Windows 上构建安装包，安装包可以在这次运行的页面下载（未签名，装上后不会自动更新）。
- 改了 `linux/` 或 `web/`：在 Ubuntu 上打 AppImage 和 deb，在虚拟显示器里运行打好的程序，把菜单点一遍、真的打字和拖动猫，安装包可以在这次运行的页面下载。
- 改了 `site/`、`web/` 或 `tools/site/`：构建一遍下载页。

检查通过、维护者看过之后 squash 合入 `main`。下载页的改动合入后自动上线，App 的改动要等下次发布，发布由维护者推 tag 完成。

## Issue

Bug 和建议直接开 Issue。想做一个新功能或改现有功能，先用「功能」模板开 Issue 说清楚目标和各端改动，对齐之后再写代码，PR 描述里写 `Closes #编号`。修 bug、改文案这类小改动可以直接提 PR。

## 许可

你的贡献按 [GPL-3.0](LICENSE) 并入本仓库，同时按 [CLA](CLA.md) 授权给维护者。
