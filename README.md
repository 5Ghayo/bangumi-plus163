# Bangumi Plus 音乐试听

`Bangumi Plus 音乐试听` 是一个运行在 Bangumi 音乐条目页的 userscript。它在原生“曲目列表”上方嵌入试听栏，并为匹配到的每首曲目添加页内试听控件。

## 安装

1. 在 Edge 安装 Tampermonkey 等 userscript 管理器。
2. 打开 `dist-userscript/bangumi-plus.user.js` 并在管理器中安装或更新脚本。
3. 访问 `bgm.tv`、`bangumi.tv` 或 `chii.in` 的音乐条目页；有“曲目列表”的页面会显示试听入口。

## 功能

- 搜索网易云音乐的单曲或专辑，并尽量补全整张专辑曲目。
- 匹配时忽略曲号、空格、标点和横线，降低同名曲目的漏匹配概率。
- 在原生曲目右侧提供加载、播放/暂停、进度拖动和时间显示。
- 根据 Bangumi 深色或浅色主题调整控件配色。
- 在网易云音乐入口旁显示登录状态。登录在新标签页完成；返回 Bangumi 后脚本会刷新状态并显示“已登录”。

## 限制与隐私

- 脚本通过 `GM_xmlhttpRequest` 请求 `music.163.com`，因此安装时需要允许该跨域访问权限。
- 登录仅使用网易云账号已有的会员或购买权限，不绕过付费、版权或地区限制。
- 脚本不会收藏、点赞、创建歌单或主动提交播放历史；搜索和音频请求仍可能被网易云作为账号活动记录。

## 开发

```bash
npm install
npm run build:userscript
npm run lint
```

构建产物为 `dist-userscript/bangumi-plus.user.js`。
