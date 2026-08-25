import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BGM_BANNER = `// ==UserScript==
// @name         Bangumi Plus 音乐试听（BGM 内置版）
// @namespace    https://github.com/bangumi/Archive
// @version      1.0.0
// @description  在 Bangumi 音乐条目页内嵌网易云音乐试听和曲目列表，不依赖 userscript 管理器
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

// 此版本不依赖 GM_xmlhttpRequest，通过支持 CORS 的 GD 音乐台接口请求网易云音频。`;

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
    outDir: 'dist-bgm',
    lib: {
      entry: 'src/bgm.tsx',
      formats: ['iife'],
      name: 'BangumiPlusMusicPlayerBgm',
      fileName: () => 'bangumi-plus-bgm.js',
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
      name: 'bgm-banner',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk' && output.fileName === 'bangumi-plus-bgm.js') {
            output.code = `${BGM_BANNER}\n${output.code}`;
          }
        }
      },
    },
  ],
});
