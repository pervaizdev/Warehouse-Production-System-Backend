const fs = require('fs');
const data = JSON.parse(fs.readFileSync('discovery_deep.json'));

let md = '# Discovery Analysis\n\n';

for (const [key, value] of Object.entries(data)) {
  md += `## ${key}\n`;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      md += 'No rows found.\n\n';
    } else {
      md += '```json\n' + JSON.stringify(value.slice(0, 2), null, 2) + '\n```\n';
      md += `Total rows in sample: ${value.length}\n\n`;
    }
  } else {
    md += '```json\n' + JSON.stringify(value, null, 2) + '\n```\n\n';
  }
}

fs.writeFileSync('discovery_analysis.md', md);
console.log('Done!');
