const fs = require('fs');
const content = fs.readFileSync('src/extension.ts', 'utf8');

const target = `  const result = new Array<Activity>(mapped.length);
  for (let i = 0; i < mapped.length; i += 1) {
    result[i] = mapped[i].item;
  }

  return result;`;

const replacement = `  return mapped.map((m) => m.item);`;

if (content.includes(target)) {
  fs.writeFileSync('src/extension.ts', content.replace(target, replacement));
  console.log('Patched final extraction mapped');
} else {
  console.error('Target code not found for final extraction');
}
