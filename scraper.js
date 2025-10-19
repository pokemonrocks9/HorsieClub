/**
 * test-scraper.js - Debug version to test ENTRY pages (spoiler-free)
 * 
 * Run this locally to debug what's happening
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

// Known race IDs from October 2025 (from web search)
// Using ENTRY pages (shutuba) not results
const KNOWN_RACE_IDS = [
  '202508030711', // Shuka Sho G1 - Oct 19
  '202508030911', // Kikuka Sho G1 - Oct 26
  '202505040604', // Tokyo Oct 18
  '202505040405', // Tokyo Oct 12
  '202508030405', // Kyoto Oct 12
];

async function testRaceId(raceId) {
  console.log(`\n🔍 Testing race ID: ${raceId}`);
  // IMPORTANT: Using shutuba.html (entries) NOT result.html
  const url = `https://en.netkeiba.com/race/shutuba.html?race_id=${raceId}`;
  console.log(`   URL: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
    });

    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);

    if (!response.ok) {
      console.log(`   ❌ Failed: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    console.log(`   HTML length: ${html.length} bytes`);
    
    // Save HTML to file for inspection
    fs.writeFileSync(`entry_${raceId}.html`, html);
    console.log(`   💾 Saved HTML to entry_${raceId}.html`);

    const $ = cheerio.load(html);

    // Debug: what's in the page?
    const pageTitle = $('title').text();
    console.log(`   Page title: ${pageTitle}`);
    console.log(`   H1 elements: ${$('h1').length}`);
    console.log(`   Tables: ${$('table').length}`);
    
    const h1Text = $('h1').first().text().trim();
    console.log(`   H1 text: "${h1Text}"`);

    // Check for entry page patterns
    const hasField = html.includes('Field');
    const hasEntries = html.includes('entries');
    const hasTable = $('table').length > 0;
    
    console.log(`   Has "Field": ${hasField}`);
    console.log(`   Has "entries": ${hasEntries}`);
    console.log(`   Has tables: ${hasTable}`);

    // Try to extract horses with detailed debugging
    let horseCount = 0;
    const foundHorses = [];
    
    console.log(`\n   📋 Analyzing table structure:`);
    let tableNum = 0;
    $('table').each((tIdx, table) => {
      tableNum++;
      const rows = $(table).find('tr');
      console.log(`\n   Table ${tableNum}: ${rows.length} rows`);
      
      $(table).find('tr').slice(0, 3).each((rIdx, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 4) {
          const cellTexts = cells.map((i, el) => $(el).text().trim()).get();
          console.log(`      Row ${rIdx}: [${cellTexts.slice(0, 6).join(' | ')}]`);
          
          // Look for post position and horse name
          for (let i = 0; i < Math.min(2, cellTexts.length); i++) {
            const num = parseInt(cellTexts[i]);
            if (!isNaN(num) && num >= 1 && num <= 20 && cellTexts[i] === String(num)) {
              horseCount++;
              if (foundHorses.length < 3) {
                const horseName = cellTexts.slice(i+1, i+4).find(t => 
                  t && t.length >= 3 && /[a-zA-Z]/.test(t) && !t.match(/^\d+$/)
                );
                const jockey = cellTexts.slice(i+2, i+6).find(t => 
                  t && t.length >= 4 && /[A-Za-z]/.test(t) && !t.match(/^\d+$/) && t !== horseName
                );
                foundHorses.push({
                  pp: num,
                  horse: horseName || '???',
                  jockey: jockey || '???'
                });
              }
              break;
            }
          }
        }
      });
    });
    console.log(`   Potential horses found: ${horseCount}`);
    if (foundHorses.length > 0) {
      console.log(`\n   Sample entries:`);
      foundHorses.forEach(h => console.log(`      #${h.pp}: ${h.horse} (J: ${h.jockey})`));
    }

    // Check if this looks like a valid entry page
    const title = pageTitle.split('|')[0].trim();
    if (title && title.length > 3 && horseCount >= 5) {
      console.log(`   ✅ Looks like a valid entry page!`);
      return { raceId, title, horses: horseCount, valid: true };
    } else {
      console.log(`   ❌ Doesn't look like valid (title: "${title}", horses: ${horseCount})`);
      return null;
    }

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function runTests() {
  console.log('🧪 Testing known race ENTRY pages from October 2025\n');
  console.log('='.repeat(60));

  const results = [];
  
  for (const raceId of KNOWN_RACE_IDS) {
    const result = await testRaceId(raceId);
    if (result) {
      results.push(result);
    }
    
    // Wait between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 SUMMARY:');
  console.log(`   Valid entry pages found: ${results.length}/${KNOWN_RACE_IDS.length}`);
  
  if (results.length > 0) {
    console.log('\n   ✅ Valid races:');
    results.forEach(r => {
      console.log(`      ${r.raceId}: ${r.title} (${r.horses} horses)`);
    });
    console.log('\n   💡 The scraper CAN access entry pages!');
    console.log('      Horse names and jockeys should be in the HTML files.');
  } else {
    console.log('\n   ❌ NO valid entry pages found!');
    console.log('      Possible issues:');
    console.log('      - Netkeiba is blocking automated requests');
    console.log('      - Entry pages not available yet (too far in future)');
    console.log('      - Network/firewall blocking the requests');
    console.log('      - Check the saved HTML files to see what was returned');
  }

  console.log('\n💡 Next steps:');
  console.log('   1. Check the saved HTML files (entry_*.html)');
  console.log('   2. Open them in a browser to see the entry lists');
  console.log('   3. If you see horse names, the scraper should work!');
  console.log('   4. If you see errors/blocks, we need a different approach');
}

runTests().catch(console.error);
