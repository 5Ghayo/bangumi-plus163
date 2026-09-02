# Bangumi Plus 音乐试听

`Bangumi Plus 音乐试听` 在 Bangumi 音乐条目页的原生“曲目列表”上方嵌入试听栏，并为匹配到的每首曲目添加页内试听控件。

提供三个版本：

- `dist-userscript/bangumi-plus.user.js`：Tampermonkey userscript 版，支持网易云登录状态与已购歌曲试听。
- `dist-bgm/bangumi-plus-bgm.js`：bgm.tv 内置“超合金组件”版，不依赖任何 userscript 管理器。
- `dist-bgm-local/bangumi-plus-bgm-local.js`：bgm.tv 内置组件的本地部署 NCM API 版，配合本机 `NeteaseCloudMusicApi` 服务使用。

## 安装

### Tampermonkey 版

1. 在 Edge 安装 Tampermonkey。
2. 打开 `dist-userscript/bangumi-plus.user.js` 并安装或更新脚本。
3. 访问 `bgm.tv`、`bangumi.tv` 或 `chii.in` 的音乐条目页；有“曲目列表”的页面会显示试听入口。

### bgm.tv 内置组件版

1. 打开 bgm.tv 的“超合金组件”页面，新建一个脚本。
2. 将 `dist-bgm/bangumi-plus-bgm.js` 的全部内容粘贴进去并保存。
3. 访问有“曲目列表”的音乐条目页，页面会显示试听入口。

### bgm.tv 本地部署 NCM API 版

这个版本使用你自己部署的 `NeteaseCloudMusicApi`，搜索更稳定，也能使用服务端保存的网易云登录权限。

1. 在本机或你自己的服务器部署 `NeteaseCloudMusicApi`，默认端口通常是 `3000`。直接使用项目里的启动命令即可；如果依赖还没安装，脚本会先自动执行 `npm install`：

   ```bash
   cd <项目目录>
   npm run ncm
   ```

   如果想在任意目录启动，也可以直接指定项目路径：

   ```bash
   npm --prefix <项目目录> run ncm
   ```

2. 如需已购、会员或更高可用性音源，请在服务进程环境中设置网易云登录 Cookie：

   ```bash
   MUSIC_U=你的网易云MUSIC_U node app.js
   ```

   这里的 Cookie 保存在你自己的服务进程里，不会写入 bgm.tv 页面代码。
3. 修改构建入口 `src/bgm-local.tsx` 顶部的 `LOCAL_API_BASE`，让它指向你的服务地址；默认是 `http://127.0.0.1:3000`。
4. 运行 `npm run build:bgm-local`，打开 bgm.tv 的“超合金组件”页面，新建脚本并粘贴 `dist-bgm-local/bangumi-plus-bgm-local.js` 的全部内容。
5. 访问有“曲目列表”的音乐条目页，页面会显示“试听：本地 NCM”入口。

注意：现代浏览器从 `https://bgm.tv` 请求 `http://127.0.0.1` 或 `http://localhost` 时，可能触发本地网络访问限制或 CORS 预检。如果浏览器拦截请求，请使用支持该部署方式的浏览器，或将 NCM API 部署到允许跨域访问的 HTTPS 地址。

## 功能

- 搜索网易云音乐的单曲或专辑，并尽量补全整张专辑曲目。
- 匹配时忽略曲号、空格、标点和横线，降低同名曲目的漏匹配概率。
- 在原生曲目右侧提供加载、播放/暂停、进度拖动和时间显示。
- 根据 Bangumi 深色或浅色主题调整控件配色。
- Tampermonkey 版在网易云音乐入口旁显示登录状态；登录在新标签页完成，返回后自动刷新。

## 两个版本的区别

| 能力 | Tampermonkey 版 | BGM 内置版 | BGM 本地 NCM 版 |
| --- | --- | --- | --- |
| 跨域请求 | `GM_xmlhttpRequest` | 第三方 GD 公开接口 | 自部署 NCM API |
| 网易云登录状态 | 支持 | 不支持 | 由服务端 Cookie 决定 |
| 已购/会员歌曲试听 | 支持 | 不支持 | 支持服务端 Cookie 权限 |
| 安装环境 | userscript 管理器 | bgm.tv 自带组件 | bgm.tv 自带组件 |

## 为什么 BGM 版使用第三方 GD 接口

bgm.tv 内置的“超合金组件”是直接运行在 bgm.tv 页面里的脚本，没有 userscript 管理器的特权 API，也拿不到网易云账号 Cookie。普通 `fetch` 又受浏览器同源策略约束：网易云官方接口不返回 `Access-Control-Allow-Origin`，从 bgm.tv 页面直接请求会被浏览器拦截，表现为 `Failed to fetch`。

第三方 GD 接口是公开服务，它在服务器端请求网易云，再把搜索结果和音频直链包装成允许跨域访问的 JSON 返回。这样 BGM 内置版就能不装任何扩展、不跳转页面、不登录，直接在曲目列表里试听。代价是它属于第三方依赖，接口不可用时试听会失败，也无法解锁付费歌曲。

## 限制与隐私

- BGM 内置版通过支持 CORS 的第三方 GD 公开接口获取搜索与音频直链，不携带账号 Cookie，也无法解锁付费歌曲；该第三方接口不可用时试听会失败。
- BGM 本地 NCM 版不经过第三方音乐台，请求只发生在浏览器和你自己部署的服务之间。搜索和播放请求仍会由网易云 API 服务端记录；如配置 `MUSIC_U`，也会作为该账号的普通请求记录。
- 登录仅使用网易云账号已有的会员或购买权限，不绕过付费、版权或地区限制。
- 脚本不会收藏、点赞、创建歌单或主动提交播放历史；搜索和音频请求仍可能被网易云作为账号活动记录。

## 开发

```bash
npm install
npm run build
npm run lint
```

- `npm run build:userscript` 构建 `dist-userscript/bangumi-plus.user.js`
- `npm run build:bgm` 构建 `dist-bgm/bangumi-plus-bgm.js`
- `npm run build:bgm-local` 构建 `dist-bgm-local/bangumi-plus-bgm-local.js`

两个构建产物均为可读的多行代码。
