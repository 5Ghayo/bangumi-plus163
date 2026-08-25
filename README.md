# Bangumi Plus 音乐试听

`Bangumi Plus 音乐试听` 在 Bangumi 音乐条目页的原生“曲目列表”上方嵌入试听栏，并为匹配到的每首曲目添加页内试听控件。

提供两个版本：

- `dist-userscript/bangumi-plus.user.js`：Tampermonkey userscript 版，支持网易云登录状态与已购歌曲试听。
- `dist-bgm/bangumi-plus-bgm.js`：bgm.tv 内置“超合金组件”版，不依赖任何 userscript 管理器。

## 安装

### Tampermonkey 版

1. 在 Edge 安装 Tampermonkey。
2. 打开 `dist-userscript/bangumi-plus.user.js` 并安装或更新脚本。
3. 访问 `bgm.tv`、`bangumi.tv` 或 `chii.in` 的音乐条目页；有“曲目列表”的页面会显示试听入口。

### bgm.tv 内置组件版

1. 打开 bgm.tv 的“超合金组件”页面，新建一个脚本。
2. 将 `dist-bgm/bangumi-plus-bgm.js` 的全部内容粘贴进去并保存。
3. 访问有“曲目列表”的音乐条目页，页面会显示试听入口。

## 功能

- 搜索网易云音乐的单曲或专辑，并尽量补全整张专辑曲目。
- 匹配时忽略曲号、空格、标点和横线，降低同名曲目的漏匹配概率。
- 在原生曲目右侧提供加载、播放/暂停、进度拖动和时间显示。
- 根据 Bangumi 深色或浅色主题调整控件配色。
- Tampermonkey 版在网易云音乐入口旁显示登录状态；登录在新标签页完成，返回后自动刷新。

## 两个版本的区别

| 能力 | Tampermonkey 版 | BGM 内置版 |
| --- | --- | --- |
| 跨域请求 | `GM_xmlhttpRequest` | 某GD接口音乐台公开接口 |
| 网易云登录状态 | 支持 | 不支持 |
| 已购/会员歌曲试听 | 支持 | 不支持 |
| 安装环境 | userscript 管理器 | bgm.tv 自带组件 |

## 为什么 BGM 版使用某GD接口音乐台

bgm.tv 内置的“超合金组件”是直接运行在 bgm.tv 页面里的脚本，没有 userscript 管理器的特权 API，也拿不到网易云账号 Cookie。普通 `fetch` 又受浏览器同源策略约束：网易云官方接口不返回 `Access-Control-Allow-Origin`，从 bgm.tv 页面直接请求会被浏览器拦截，表现为 `Failed to fetch`。

某GD接口音乐台是第三方公开服务，它在服务器端请求网易云，再把搜索结果和音频直链包装成允许跨域访问的 JSON 返回。这样 BGM 内置版就能不装任何扩展、不跳转页面、不登录，直接在曲目列表里试听。代价是它属于第三方依赖，接口不可用时试听会失败，也无法解锁付费歌曲。

## 限制与隐私

- BGM 内置版通过支持 CORS 的某GD接口音乐台公开接口获取搜索与音频直链，不携带账号 Cookie，也无法解锁付费歌曲；该第三方接口不可用时试听会失败。
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

两个构建产物均为可读的多行代码。
