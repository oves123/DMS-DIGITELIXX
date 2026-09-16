const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, 'node_modules/mongoose/package.json');
if (fs.existsSync(p)) {
  const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (pkg.browser) {
    delete pkg.browser;
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
    console.log('Patched mongoose package.json to remove browser field for Cloudflare Workers compatibility.');
  }
}
