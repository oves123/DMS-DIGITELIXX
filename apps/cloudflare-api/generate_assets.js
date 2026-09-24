const fs = require('fs');
const logo = fs.readFileSync('d:/cashmitra/DMS/apps/web/public/logo.png', 'base64');
const sig = fs.readFileSync('d:/cashmitra/DMS/etc files/Sign.jpeg', 'base64');

const tsContent = `export const logoBase64 = 'data:image/png;base64,${logo}';\nexport const signatureBase64 = 'data:image/jpeg;base64,${sig}';\n`;
fs.writeFileSync('d:/cashmitra/DMS/apps/cloudflare-api/src/services/assets.ts', tsContent);
console.log('done');
