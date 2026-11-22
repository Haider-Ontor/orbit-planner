// Copies the Gradle output to release/Orbit.apk so the Android build sits next to Orbit-Setup.exe.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const out = path.join(root, 'release', 'Orbit.apk');
if (!fs.existsSync(src)) { console.error('APK not found at', src); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(src, out);
console.log('wrote', out);
