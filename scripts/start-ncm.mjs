import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const ncmEntry = `${projectRoot}node_modules/NeteaseCloudMusicApi/app.js`;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!existsSync(ncmEntry)) {
  console.info('首次启动：正在安装 NeteaseCloudMusicApi...');
  const install = spawnSync(npmCommand, ['install', '--no-audit', '--no-fund'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (install.status !== 0) {
    console.error('NCM API 安装失败，请检查网络或 npm 配置。');
    process.exitCode = install.status ?? 1;
    process.exit(process.exitCode);
  }
}

const server = spawn(process.execPath, [ncmEntry], {
  cwd: projectRoot,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill(signal);
  });
}
