# tab-home

**让你的新标签页有意义。**

tab-home 是一个 Chrome 浏览器扩展，把默认的「新标签页」替换成一个干净的个人仪表板：左侧是长期收藏的网址，右侧是当前打开的所有标签（按域名分组）。

核心功能完全本地运行：收藏、标签分组、快照和设置都存放在 `chrome.storage.local`。可选功能包括 Supabase 云同步和本地天气；只有你主动配置或开启时才会联网。Fork 自 [tab-out](https://github.com/zarazhangrui/tab-out) by [Zara](https://x.com/zarazhangrui)。

---

## 主要功能

### 收藏区（左半屏）
- **无限收藏网格**，超出视口后在收藏列内滚动
- 鼠标悬停 → 右上角出现 ⋯ 菜单，可编辑或删除
- 自动抓取网站 logo（优先 `apple-touch-icon.png`，兜底 Chrome 缓存的 favicon）
- **二进制缓存**：图标加载成功后转 base64 存进 `chrome.storage.local`，之后刷新页面零网络请求
- **自定义 logo**：编辑收藏时可上传图片或直接 `Cmd+V` 粘贴剪贴板里的图片，自动压缩到 256×256
- **智能命名**：留空标题自动从 URL 提取品牌名（`www.binance.com` → `Binance`，`accounts.binance.com` → `Binance`）

### 当前标签区（右半屏）
- 按域名自动分组成卡片
- **固定标签**单独置顶显示，与未固定的明确分开
- 每个标签卡片有四个操作：
  - ⭐ 加入收藏 / 取消收藏（取消时弹自定义确认框）
  - 📌 固定 / 取消固定
  - ✕ 关闭这个标签
  - 重复标签会显示 `重复 x N` 徽章，悬停变成「关闭重复」按钮
- **按最近活跃排序**：你刚切过去的网站组所在卡片排在最顶上
- 实时同步：在浏览器其他位置开/关/切换标签，这里跟着自动刷新

### 右键菜单
- 在任意网页右键 → 「Add page to tab-home favorites」直接收藏当前页
- 右键链接 → 「Add link to tab-home favorites」收藏该链接

### 其他
- 🌙 / ☀️ **深色 / 浅色模式切换**（右上角，自动记忆）
- 🌐 **中英文切换**（右上角，所有 UI 文案跟着切）
- 直接点收藏 → 当前 tab 跳转；`Cmd+点击` → 后台新 tab；`Cmd+Shift+点击` → 前台新 tab；`Shift+点击` → 新窗口（与原生 `<a>` 链接行为完全一致）
- 右键收藏 → 弹出 Chrome 标准的链接菜单

---

## 安装方式

### 方法 1：让 Coding Agent 帮你装

把这个仓库地址发给 Claude Code / Codex / Cursor 等 agent，告诉它「install this」：

```
https://github.com/wolfyxbt/tab-home
```

它会一步步带你装好。约 1 分钟搞定。

### 方法 2：手动安装

**1. Clone 仓库**

```bash
git clone https://github.com/wolfyxbt/tab-home.git
```

**2. 加载到 Chrome**

1. 打开 Chrome，访问 `chrome://extensions`
2. 右上角打开 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 clone 下来的 `extension/` 文件夹

**3. 打开新标签页**

你会看到 tab-home 出现。

---

## 工作原理

```
你打开新标签页
  → tab-home 显示左侧收藏 + 右侧当前标签（按域名分组）
  → 固定标签独立置顶
  → 点击任意标签即可切过去
  → 关掉一组（X 按钮 + 撒花动画 + 音效）
```

所有运行都在 Chrome 扩展内部完成。无外部服务器、无 API 调用、无数据上传。收藏数据存在 `chrome.storage.local`，你的隐私归你自己。

---

## 技术栈

| 用途 | 实现 |
|------|------|
| 扩展 | Chrome Manifest V3 |
| 数据存储 | chrome.storage.local |
| 图标缓存 | base64 二进制 + 全局图片错误回退链 |
| 音效 | Web Audio API（合成，无音频文件）|
| 动效 | CSS transitions + JS 撒花粒子 |
| 字体 | 系统字体栈（无远程字体请求） |
| 多语言 | 自研 i18n 字符串表 |

零依赖，零 npm，零构建。clone 完直接 load。

---

## 自定义

`extension/config.local.js`（gitignored）可以放个性化配置。比如自定义某些域名的「主页」分组规则——参考代码里的 `LOCAL_LANDING_PAGE_PATTERNS` 和 `LOCAL_CUSTOM_GROUPS` 默认值。

---

## Supabase 云同步（进行中）

项目已经开始为 Supabase 多用户同步做基础铺设。

当前仓库里有两部分可直接使用：

- 工作流程文档：[`docs/supabase-sync-workflow.md`](docs/supabase-sync-workflow.md)
- 数据库 schema：[`supabase/schema.sql`](supabase/schema.sql)

建议接入顺序：

1. 在 Supabase 创建项目
2. 运行 `supabase/schema.sql`
3. 创建背景图 Storage bucket
4. 复制 `extension/config.local.example.js` 为 `extension/config.local.js`
5. 在 `config.local.js` 里填写：
   - `LOCAL_SUPABASE_PROJECT_URL`
   - `LOCAL_SUPABASE_ANON_KEY`
6. 下一步再接登录和真实同步逻辑

当前扩展会优先从 `extension/config.local.js` 读取 Supabase 配置。

---

## License

MIT

---

tab-home by [WolfyXBT](https://x.com/wolfyxbt) · forked from [tab-out](https://github.com/zarazhangrui/tab-out) by [Zara](https://x.com/zarazhangrui)

