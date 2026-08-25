import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const USERSCRIPT_BANNER = `// ==UserScript==
// @name         Bangumi Plus 音乐试听
// @namespace    https://github.com/bangumi/Archive
// @version      1.0.0
// @description  在 Bangumi 音乐条目页内嵌网易云音乐试听和曲目列表
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
// @grant        GM_xmlhttpRequest
// @connect      api.bgm.tv
// @connect      music.163.com
// ==/UserScript==`;

export default defineConfig({
  // React's CommonJS bundle selects its production implementation through
  // process.env.NODE_ENV. A userscript runs directly in the browser, where
  // `process` does not exist, so replace this expression at build time.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: true,
    outDir: 'dist-userscript',
    lib: {
      entry: 'src/userscript.tsx',
      formats: ['iife'],
      name: 'BangumiPlusMusicPlayer',
      fileName: () => 'bangumi-plus.user.js',
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
      name: 'userscript-metadata',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk' && output.fileName === 'bangumi-plus.user.js') {
            output.code = `${USERSCRIPT_BANNER}\n${output.code}`;
          }
        }
      },
    },
  ],
});
