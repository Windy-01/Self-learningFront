# 项目前后端施工中

后端未公开仓库

## 前端目录分层

```text
src/
├── api/                    # 接口层：站内唯一的网络出口
│   ├── http.ts             # 请求封装：baseURL / Bearer 令牌 / 统一错误
│   ├── session.ts          # 会话：令牌存储、登录态、跨标签页同步
│   ├── auth.ts             # 登录 / 注册 / 退出
│   └── users.ts            # 当前用户资料（接口预留，暂返回 null）
├── components/             # 通用组件层
│   └── common/             # 与业务无关的基础组件
│       ├── AppIcon.vue     # inline SVG 图标
│       ├── icons.ts        # 图标路径表
│       ├── AuthCard.vue    # 登录 / 注册 / 退出共用卡片外壳
│       └── SettingsDialog.vue  # 设置弹窗（API 地址 / 配置来源）
├── composables/            # 组合式函数层
│   ├── useTheme.ts         # 明暗主题：切换 / 持久化
│   └── useAccount.ts       # 账号展示状态（显示名 / 首字母 / 登录态）
├── config/                 # 配置层：cookie 持久化 + 继承
│   ├── index.ts            # useConfig / saveConfig / resetConfig
│   ├── types.ts            # SiteConfig / ConfigSource
│   ├── defaults.ts         # 默认值
│   └── endpoint.ts         # API base url 规整与校验
├── utils/                  # 工具层
│   └── cookie.ts           # cookie 读写（沿用父项目实现）
├── layouts/                # 布局层：控制台外壳
│   ├── AdminLayout.vue     # 顶栏 + 浮动侧栏 + 正文
│   └── components/
│       ├── AppHeader.vue   # 顶部横向导航 + 搜索 + 用户菜单
│       └── AppAside.vue    # 浮动可折叠侧栏（账号 / 主题）
├── router/                 # 路由层
│   ├── index.ts            # 路由实例（hash 模式）+ 全局守卫
│   ├── pages.ts            # 业务页面路由（懒加载 + meta 声明）
│   ├── routes.ts           # 根路由：布局壳 + 子路由
│   └── menu.ts             # 由路由表推导顶部导航
├── styles/                 # 样式层
│   ├── reset.css           # 基础重置
│   ├── variables.css       # 设计令牌（颜色 / 尺寸 / 圆角）
│   └── index.css           # 入口样式与全局约定
├── types/                  # 类型层：跨模块共享类型
│   ├── menu.ts
│   └── router.d.ts         # RouteMeta 类型扩展
├── views/                  # 页面层：一个页面一个目录
│   ├── dashboard/DashboardView.vue   # 临时主页
│   └── auth/                         # 登录 / 注册 / 退出
├── App.vue
└── main.ts
```

分层约定：

- 布局与页面分离：布局只渲染外壳，页面只渲染正文。
- 通用组件放 `components/common/`，业务组件与页面同目录。
- 颜色 / 间距 / 圆角一律取 `styles/variables.css` 的 CSS 变量，不写死色值。
- 新增页面只需两步：`views/` 建页面 → `router/pages.ts` 加一条路由。顶部导航由路由 `meta.menu` 自动生成，不需要单独维护菜单。
- 跳转统一用路由名：`router.push({ name: 'dashboard' })`、`<RouterLink :to="{ name: 'dashboard' }">`。
- 页面标题只在 `router/index.ts` 的守卫里写一次，页面内不碰 `document.title`。
- 路径统一用 `@/` 别名指向 `src`。

## 导航结构

- **顶部栏（fixed，64px）**：左品牌、居中横向导航（由路由 meta 推导，`meta.menu: true` 的页面才会出现）、右侧搜索 / 主题 / 刷新 / 用户菜单。
- **浮动侧栏（sticky）**：不是满屏高的贴边导航，而是悬浮卡片，可折叠（240px ⇄ 64px），收起状态存 `localStorage`。承载账号信息、登录 / 退出、主题切换。
- **正文**：窗口滚动，切页由路由 `scrollBehavior` 回到顶部；≤900px 时侧栏隐藏，导航仍在顶栏。

## 配置与 cookie 继承

本站是父项目 `windy-01.github.io` 的子项目（`/Self-learningFront/`），同源因此可以读到父站点的 cookie。

| | cookie 名 | 说明 |
|---|---|---|
| 本项目 | `console-settings` | 自己写、自己读，与父项目互不覆盖 |
| 父项目 | `windy-settings` | 只读，用于首次继承 |

读取顺序（`config/index.ts`）：

1. `console-settings` 有键 → 用本项目的配置（`source: 'own'`）；
2. 没有 / 内容为空 → 从 `windy-settings` 继承双方共有的字段（`source: 'inherited'`）；
3. 两处都没有 → 内置默认值（`source: 'default'`）。

- 逐字段校验：字段缺失、类型不对、JSON 损坏都只让该字段回落到默认值，不会整体失效。
- 目前共有的字段只有 `apiBaseUrl`；新增共有字段时在 `inheritFromLegacy()` 里补一行。
- `saveConfig()` 写 `console-settings`，写完就不再继承；`resetConfig()` 删掉自己的 cookie，会重新走一遍继承。
- 接口地址优先级：`config.apiBaseUrl` > `VITE_API_BASE_URL` > 与站点同源。
- 入口：侧栏「设置」，弹窗里能看到当前配置来源（本项目 / 继承 / 默认）。

## 账号系统

- 令牌存 `localStorage`（key `console-session`），会话状态是响应式的 `session` / `loggedIn`。
- `api/http.ts` 在发请求时自动附加 `Authorization: Bearer <token>`；带鉴权的请求收到 401 会清掉本地会话。
- 登录 / 注册 / 退出是公开接口，显式 `auth: false`，不会带过期令牌。
- 后端契约：`POST /login` → `{ token, token_type }`；`POST /register`、`GET /logout` 只返回状态码。
- 接口地址取 `config.apiBaseUrl`（cookie），留空时回落到 `VITE_API_BASE_URL`，再留空则与站点同源。
- 资料接口 `GET /users/me` 尚未接入，`api/users.ts` 里的 `fetchCurrentUser()` 恒返回 `null`，界面暂时用登录时填的账号作为显示名。
- 路由守卫：未登录访问 `/logout` 会跳到 `/login`。

## 视觉规范（黑 / 灰 / 白单色）

- 只用中性色：没有品牌色、没有渐变、没有彩色阴影，层次全靠明度差和 1px 描边。
- 主色 `--accent` 是「当前主题下最深的中性色」：浅色为 `#171717`，深色反转为 `#f5f5f5`，用于 logo 底、头像底、选中态与焦点边框。
- 文字三级灰：浅色 `#0a0a0a / #525252 / #8a8a8a`，深色 `#f5f5f5 / #a3a3a3 / #737373`。
- 语义色（success / warning / danger / info）统一映射到灰阶，保留变量名方便以后换回彩色，但当前不会出现鲜亮颜色。
- 圆角 4–6px、卡片 1px 描边、阴影极轻，所有颜色与尺寸都在 `styles/variables.css`。

## 主题

- 两套配色：`<html data-theme="light">`（默认，白底黑字）与 `data-theme="dark"`（纯黑底白字），两套都是灰阶。
- 切换逻辑在 `composables/useTheme.ts`：写入 `localStorage`（key 为 `console-theme`），刷新后保持上次选择。
- `index.html` 里有一段前置脚本，在样式生效前先定好 `data-theme`，避免刷新时闪屏。
- 顶栏右侧的太阳 / 月亮按钮、侧栏底部都可切换。

## 路由

- **history 模式**：`createWebHistory(import.meta.env.BASE_URL)`，地址形如 `/dashboard`、`/login`，不带 `#`。
- `BASE_URL` 由 vite 注入：本地为 `/`，GitHub Pages 项目页为 `/Self-learningFront/`，子路径部署时路由前缀自动正确。
- 静态托管没有服务端 rewrite，部署流程会把 `dist/index.html` 复制成 `dist/404.html` 兜底；直接访问 `/dashboard` 刷新时由它接管，再由前端路由解析回对应页面。
- 未匹配的路径统一 `redirect` 到主页，避免空白页。

## 开发

```bash
npm install
npm run dev     # 本地开发
npm run build   # 类型检查 + 构建
```

部署：推送到 main 后由 GitHub Actions 构建并发布到 GitHub Pages（子路径 `/Self-learningFront/`），
构建后自动生成 `404.html` 作为 history 路由的兜底页。
