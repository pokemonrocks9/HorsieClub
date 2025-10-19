/**
 * parse-test.js - Parse a saved HTML file to see the structure
 * 
 * Usage: node parse-test.js entry_202508030911.html
 */

import * as cheerio from 'cheerio';
import fs from 'fs';

const filename = process.argv[2] || 'entry_202508030911.html';

console.log(`📖 Reading ${filename}...\n`);

const html = fs.readFileSync(filename, 'utf8');
const $ = cheerio.load(html);

console.log(`Page title: ${$('title').text()}\n`);

// Find all tables
let tableNum = 0;
$('table').each((tIdx, table) => {
  tableNum++;
  const rows = $(table).find('tr');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TABLE ${tableNum} (${rows.length} rows)`);
  console.log('='.repeat(60));
  
  // Show first 5 rows in detail
  $(table).find('tr').slice(0, 5).each((rIdx, row) => {
    const cells = $(row).find('td, th');
    if (cells.length > 0) {
      const cellTexts = cells.map((i, el) => {
        const text = $(el).text().trim();
        return text.length > 20 ? text.substring(0, 20) + '...' : text;
      }).get();
      
      console.log(`\nRow ${rIdx} (${cells.length} cells):`);
      cellTexts.forEach((text, i) => {
        console.log(`  [${i}]: "${text}"`);
      });
    }
  });
});

// Try to find horses
console.log(`\n${'='.repeat(60)}`);
console.log(`ATTEMPTING TO EXTRACT HORSES`);
console.log('='.repeat(60));

const horses = [];
$('table tr').each((i, row) => {
  const cells = $(row).find('td');
  if (cells.length >= 4) {
    const cellTexts = cells.map((i, el) => $(el).text().trim()).get();
    
    // Look for post position (clean number 1-20)
    for (let idx = 0; idx < Math.min(3, cellTexts.length); idx++) {
      const text = cellTexts[idx];
      const num = parseInt(text);
      
      if (!isNaN(num) && num >= 1 && num <= 20 && text === String(num)) {
        // Found a post position!
        let horseName = null;
        let jockey = null;
        
        // Look for horse name in next few cells
        for (let j = idx + 1; j < Math.min(idx + 4, cellTexts.length); j++) {
          const candidate = cellTexts[j];
          if (candidate && 
              candidate.length >= 3 && 
              /[a-zA-Z]/.test(candidate) &&
              !candidate.match(/^\d+$/) &&
              !candidate.includes('kg')) {
            horseName = candidate;
            break;
          }
        }
        
        // Look for jockey after horse name
        for (let j = idx + 2; j < Math.min(idx + 7, cellTexts.length); j++) {
          const candidate = cellTexts[j];
          if (candidate && 
              candidate.length >= 4 && 
              candidate.length <= 30 &&
              /[A-Za-z]/.test(candidate) &&
              !candidate.match(/^\d+$/) &&
              !candidate.includes('kg') &&
              candidate !== horseName) {
            jockey = candidate;
            break;
          }
        }
        
        if (horseName && jockey) {
          horses.push({ number: num, name: horseName, jockey });
          console.log(`✅ #${num}: ${horseName} (${jockey})`);
        } else {
          console.log(`⚠️  #${num}: horse="${horseName}", jockey="${jockey}"`);
        }
        break;
      }
    }
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log(`SUMMARY: Found ${horses.length} horses`);
console.log('='.repeat(60));

if (horses.length > 0) {
  console.log('\n✅ SUCCESS! Parser can extract horses from this file.');
  console.log('\nSample horses:');
  horses.slice(0, 5).forEach(h => {
    console.log(`  #${h.number}: ${h.name} (J: ${h.jockey})`);
  });
} else {
  console.log('\n❌ FAILED to extract horses. Check the table structure above.');
  console.log('Look at the cell contents and identify which columns have:');
  console.log('  - Post position (number 1-20)');
  console.log('  - Horse name');
  console.log('  - Jockey name');
}
