# KeyCat

一只住在你桌面上的猫。它趴在一把小键盘前，你打字，它也伸爪子跟着按；你晃鼠标，它扭头盯着看。摸摸头会眯眼呼噜，太久没人理就睡着，被烦到了会用尾巴捶桌子。

macOS、Windows、Linux 都能用，免费开源。除了检查更新，它不联网，也不记录你打了什么。

![KeyCat](assets/keycat-tour.gif)

想先看看？[下载页](https://ellobodk.github.io/KeyCat/)上就有一只，可以直接用键盘鼠标逗它，页面也会按你的系统给出安装包。

## 安装

### macOS（13 及以上）

打开「终端」，粘贴这行回车，会装进「应用程序」并打开：

```sh
curl -L -o /tmp/KeyCat-macOS.zip https://github.com/ElloboDK/KeyCat/releases/latest/download/KeyCat-macOS.zip \
  && unzip -qo /tmp/KeyCat-macOS.zip -d /Applications && open /Applications/KeyCat.app
```

第一次打开时，去「系统设置 → 隐私与安全性 → 输入监控」里允许 KeyCat，再重新打开它。猫靠这个权限知道你按了哪个键，它只看是哪个键，不记内容。

用浏览器下载的话，解压后拖进「应用程序」。如果提示「已损坏」，在终端执行 `xattr -dr com.apple.quarantine /Applications/KeyCat.app`。

### Windows（10 / 11）

下载 [`KeyCat-Windows-Setup.exe`](https://github.com/ElloboDK/KeyCat/releases/latest/download/KeyCat-Windows-Setup.exe) 运行。SmartScreen 拦下来时，点「更多信息 → 仍要运行」。

安装包只有几 MB，猫由系统自带的 WebView2 来画，极少数没有 WebView2 的 Win10 会在安装时自动下载。KeyCat 装在 `C:\Program Files\KeyCat`，所以安装和更新时会弹一次 UAC。

### Linux（64 位，X11）

Ubuntu、Debian 用 deb 包，在终端执行（会要你输入密码），装好后在应用列表里打开 KeyCat：

```sh
curl -L -o /tmp/KeyCat-Linux.deb https://github.com/ElloboDK/KeyCat/releases/latest/download/KeyCat-Linux.deb \
  && sudo apt install -y /tmp/KeyCat-Linux.deb
```

其他发行版下载 [`KeyCat-Linux.AppImage`](https://github.com/ElloboDK/KeyCat/releases/latest/download/KeyCat-Linux.AppImage)，`chmod +x KeyCat-Linux.AppImage` 后直接运行，不用安装，也不需要 libfuse2。

KeyCat 需要 X11 桌面。Wayland 下猫能显示，但对打字没反应，见下面的[常见问题](#常见问题)。

### 更新

装好之后不用再管。KeyCat 启动 15 秒后和之后每 6 小时检查一次新版，在后台下载好，点菜单里的「重启并更新」就换上新版（mac 在退出时也会自动换）。

- Windows 更新时会弹 UAC；Linux 的 deb 版会弹窗要密码。
- AppImage 更新是直接替换文件本身，所以请把它放在自己有写权限的目录里。
- 很老的版本没有自动更新：mac 1.0.2 及以前需要用上面的命令重装一次。Windows 1.0.4 及以前装在用户目录里的旧版会自动升级过来，设置都保留。

## 和它相处

猫住在 mac 的菜单栏、Windows 和 Linux 的托盘里。**右键猫**或点图标打开菜单，**按住猫的身体**可以把它拖到别处。

**摸摸它。** 鼠标按在猫头上就是摸头，它会眯眼，摸久了会呼噜、踩奶（声音默认关着，菜单里能打开）。双击猫头等于对它慢眨眼，它可能会眨回来。

**它自己会找事做。** 闲着的时候，它会盯上桌上的杯子，先看你一眼，再举着爪子试探几下，然后推下去。推到一半被你动鼠标撞见，它会僵住，接着要么若无其事地收回爪子，要么当着你的面推下去。睡醒会打哈欠、伸懒腰。睡着后还没人理，它会扑到键盘上趴成一团，脸埋在两只爪子中间睡，睡熟了爪子还会抽一下。

**它认得几个快捷键。** 连按退格它会冒汗，保存时点头，复制时把东西举到头顶，粘贴时放下。

**它也会照顾你。** 连续工作 50 分钟左右，它会扑上键盘提醒你休息：先撅着屁股盯住键盘，再整只趴下霸占它。你还想打字，它会举起一只爪子亮出肉垫拦你；你停手一会儿，它会眯着眼自己乱按几个键。离开一会儿或者摸摸它（再给你 10 分钟），它就会下来。深夜还在用电脑，它会犯困、催你去睡。想专心的时候，在菜单里开个番茄钟，它会安静地陪着。

**它有自己的日子。** 圣诞、万圣节、春节和你们认识的纪念日，它会戴上帽子或围巾；冬天会缩成一团。几天没见面它会生闷气，摸一会儿就好了。

## 打扮它

菜单里的三组设置：

- **外观**：毛色（黑猫、橘猫、三花、暹罗、布偶、德文卷毛等 11 种）、大小、眼睛颜色和高光、手套颜色、项圈、腮红。暹罗和布偶的脸、耳朵、爪子默认是柔和渐变，想要清楚的硬边可以关掉「重点色柔和渐变」。
- **桌面**：键盘颜色、鼠标线、桌上的杯子，还有透明度。猫挡住你要看的字时，把透明度调低一点。
- **习性**：多久睡着、要不要呼噜声。「调节反应…」里可以给它选个性格（高冷、粘人、暴躁、胆小），也可以逐项调烦躁、好奇、呼噜、休息提醒和番茄钟；底下的按钮能让它当场演示各种动作。

一只不够，可以在「第二只猫」里再养一只。两只会互相看、互相拍，也可以分工：一只陪你打字，一只管鼠标。

## 今日小结和动图

「今日小结…」记着今天你按了多少键（每 300 下换一条小鱼干）、摸了它几次、它睡了多久，还有你们的关系到了哪一级，可以存成图片。「拍一张动图」会录一段 3 秒的 GIF。两种图片都存在「图片/KeyCat」文件夹。

KeyCat 只记这些次数，不记你按了哪些键。

## 直播和录屏

打开菜单里的「鼠标穿透」，点在猫身上的鼠标会直接落到下面的窗口，猫照常显示、照常反应。这时右键猫不再弹菜单，要从菜单栏或托盘图标打开。

## 常见问题

**mac 上猫对打字没反应？** 多半是还没给「输入监控」权限，菜单栏图标会显示 `🐈‍⬛⚠️`。按菜单里的提示去系统设置里允许，再重新打开 KeyCat。

**Windows 上玩游戏时猫不动了？** 很多游戏以管理员身份运行，普通权限的 KeyCat 收不到发给它们的按键。在菜单里打开「以管理员身份运行」，确认一次 UAC 就好。

- 同时开着开机自启的话，之后登录和手动打开都不再弹 UAC（只对装在 Program Files 里的 KeyCat 有效）。没开开机自启，每次打开都会弹。
- 关掉这个选项后，下次启动 KeyCat 才会恢复普通权限。
- 以管理员身份运行时，录屏软件按窗口抓不到猫，请改用整屏采集。
- 独占全屏的游戏会盖住所有窗口，猫也看不到了，请把游戏改成无边框窗口模式。

**Linux 上猫对打字没反应？** 你可能在用 Wayland 会话，菜单里会有提示。Wayland 不让程序收到发给别的窗口的按键。退出登录，在登录界面点右下角的齿轮，选「Ubuntu on Xorg」（其他发行版找名字里带 Xorg 或 X11 的会话）再登录。

**Linux 上找不到托盘图标？** GNOME 默认不显示托盘，要装 AppIndicator 扩展（Ubuntu 已经自带）。没有托盘也没关系，右键猫一样能打开菜单。

**它会偷看我打的字吗？** 不会。KeyCat 只知道哪个键被按下、什么时候抬起，用来让爪子落在对应的位置。它只存次数和时长，不存按键内容，除了检查和下载更新也不联网。代码都在这里，可以自己查。

## 自己构建

```sh
python3 tools/serve.py   # 只看猫：浏览器打开 http://127.0.0.1:8765/index.html?dev

sh mac/build.sh          # → build/KeyCat.app（通用二进制，需 Xcode 命令行工具）
sh mac/package.sh        # → dist/KeyCat-macOS.zip + .sha256 + latest-mac.json

cd win && npm ci
npm start                # 本机调试，macOS 上也能跑
npm run dist             # → 安装包（需 Rust 和 Node.js 22+，在 Windows 上执行）

cd linux && npm ci
npm run input && npm start   # 本机调试，macOS 上也能跑，只是收不到全局按键
npm run dist             # → AppImage 和 deb（需 Rust 的 x86_64-unknown-linux-musl 目标，在 Linux 上执行）
npm run check            # 用 Playwright 把菜单点一遍；在 Linux 上装了 xdotool 时还会真的打字、摸头、拖动

node tools/site/build.js # 下载页 → _site/
```

mac 版在本地用 `signing/` 里的证书签名。第一次构建时自动生成，之后一直用这一张，这样重新编译后「输入监控」授权不会失效。这张证书只给自己调试用，不是正式发布用的那张，不要提交 `signing/` 目录。

正式的安装包由 GitHub Actions（`.github/workflows/build.yml`）构建：推 `vX.Y.Z` tag 后签名并发布到本仓库的 Release，各平台装好的 KeyCat 都从这里下载更新。

想一起改进它？看 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 目录

```
web/     各平台共用的 three.js 场景：猫、键盘、动作。tuning.js 是可调参数和性格的唯一来源，
         life.js 是猫记住的东西，stats.html 是今日小结
mac/     macOS 外壳（Swift）：浮窗、菜单、键鼠监听、自动更新、构建 / 签名 / 打包脚本
win/     Windows 外壳（Tauri，Rust）：托盘、全局键鼠钩子、自动更新，页面由系统 WebView2 绘制
linux/   Linux 外壳（Electron）：托盘、自动更新、AppImage 和 deb 打包；input/ 是监听 X11 键鼠的小程序（Rust，XInput2）
site/    下载页，tools/site/build.js 把它和 web/ 拼好，由 .github/workflows/pages.yml 部署到 GitHub Pages
assets/  README 和下载页用的动图
tools/   开发用脚本：serve.py 起本地服务，tour_gif.py、readme_gif.py 生成上面的动图，其余脚本截图对比
```

## 许可

KeyCat 按 [GNU General Public License v3.0](LICENSE) 开源，Copyright (C) 2026 ElloboDK。你可以自由使用、修改和再分发；再分发时（包括改过的版本）必须同样按 GPL-3.0 提供源码。

「KeyCat」这个名字和图标不在授权范围内。发布修改版请换个名字和图标，别让人以为是官方版本。

这是一个从零实现的项目，形象和交互参考了一款付费桌面宠物应用，不包含对方的任何素材。three.js 为 MIT 许可（见 `web/THREE_LICENSE`），Tauri 为 MIT / Apache-2.0 双许可，Electron 为 MIT 许可。
