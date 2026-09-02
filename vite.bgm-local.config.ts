import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BGM_LOCAL_BANNER = `// ==UserScript==
// @name         Bangumi Plus 音乐试听（BGM 本地 NCM 版）
// @namespace    https://github.com/bangumi/Archive
// @version      1.0.0
// @description  在 Bangumi 音乐条目页内嵌本地部署 NCM API 的网易云试听列表
// @match        https://bgm.tv/subject/*
// @match        http://bgm.tv/subject/*
// @match        https://bgm.tv/*
// @match        http://bgm.tv/*
// @match        https://www.bgm.tv/subject/*
// @match        http://www.bgm.tv/subject/*
// @match        https://www.bgm.tv/*
// @match        http://www.bgm.tv/*
// @match        https://bangumi.tv/subject/*
// @match        http://bangumi.tv/subject/*
// @match        https://bangumi.tv/*
// @match        http://bangumi.tv/*
// @match        https://www.bangumi.tv/subject/*
// @match        https://www.bangumi.tv/*
// @match        http://www.bangumi.tv/*
// @match        https://chii.in/subject/*
// @match        http://chii.in/subject/*
// @match        https://chii.in/*
// @match        http://chii.in/*
// @match        https://www.chii.in/subject/*
// @match        https://www.chii.in/*
// @match        http://www.chii.in/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

// 此版本使用本机部署的 NeteaseCloudMusicApi，搜索与音源请求由本地服务器转发。`;

export default defineConfig({
  // React's CommonJS bundle selects its production implementation through
  // process.env.NODE_ENV. The BGM component runs directly in the page, where
  // `process` does not exist, so replace this expression at build time.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    minify: false,
    emptyOutDir: true,
    outDir: 'dist-bgm-local',
    lib: {
      entry: 'src/bgm-local.tsx',
      formats: ['iife'],
      name: 'BangumiPlusMusicPlayerBgmLocal',
      fileName: () => 'bangumi-plus-bgm-local.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'bgm-local-banner',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk' && output.fileName === 'bangumi-plus-bgm-local.js') {
            output.code = `${BGM_LOCAL_BANNER}\n${output.code}`;
          }
        }
      },
    },
  ],
});
