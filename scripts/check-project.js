const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sourceFiles = [
    'js/audio-storage.js',
    'js/data-manager.js',
    'js/audio-engine.js',
    'js/history-manager.js',
    'js/ui.js',
    'js/app.js'
];
const requiredOfflineAssets = [
    'vendor/fontawesome/LICENSE.txt',
    'vendor/fontawesome/css/fontawesome.min.css',
    'vendor/fontawesome/css/solid.min.css',
    'vendor/fontawesome/webfonts/fa-solid-900.woff2',
    'vendor/fontawesome/webfonts/fa-solid-900.ttf'
];

for (const relativePath of [...sourceFiles, ...requiredOfflineAssets]) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Missing required file: ${relativePath}`);
    }
}

for (const relativePath of sourceFiles) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, relativePath)], {
        encoding: 'utf8'
    });
    if (result.status !== 0) {
        process.stderr.write(result.stderr);
        throw new Error(`Syntax check failed: ${relativePath}`);
    }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
const remoteMarkup = /<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:)?\/\//i;
const remoteCss = /(?:@import\s+|url\()[^;\r\n]*(?:https?:)?\/\//i;

if (remoteMarkup.test(html) || remoteCss.test(css)) {
    throw new Error('Active UI assets include a remote dependency; offline check failed.');
}

console.log('Project checks passed: syntax valid and UI assets are local.');
