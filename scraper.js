/**
 * test-scraper.js - Debug version to test specific race IDs
 * 
 * Run this locally to debug what's happening
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

// Known race IDs from October 2025 (from web search)
const KNOWN_RACE_IDS = [
  '202508030711', // Shuka Sho G1 - Oct 19
  '202508030911', // Kikuka Sho G1 - Oct 26
  '202505040604', // Tokyo Oct 18
  '202505040405', // Tokyo Oct 12
  '202508030405', // Kyoto Oct 12
];

async function testRaceId(raceId) {
  console.log(`\n🔍 Testing race ID: ${raceId}`);
  const url = `https://en.netkeiba.com/race/result.html?race_id=${raceId}`;
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
    fs.writeFileSync(`race_${raceId}.html`, html);
    console.log(`   💾 Saved HTML to race_${raceId}.html`);

    const $ = cheerio.load(html);

    // Debug: what's in the page?
    console.log(`   Page title: ${$('title').text()}`);
    console.log(`   H1 elements: ${$('h1').length}`);
    console.log(`   Tables: ${$('table').length}`);
    
    const h1Text = $('h1').first().text().trim();
    console.log(`   H1 text: "${h1Text}"`);

    // Check for common patterns
    const hasFullResult = html.includes('Full Result');
    const hasRaceData = html.includes('RaceData');
    const hasResultTable = $('table.race_table_01, table').length > 0;
    
    console.log(`   Has "Full Result": ${hasFullResult}`);
    console.log(`   Has "RaceData": ${hasRaceData}`);
    console.log(`   Has result table: ${hasResultTable}`);

    // Try to extract basic info
    let title = h1Text;
    if (!title || title.length < 3) {
      title = $('title').text().split('|')[0].trim();
    }
    console.log(`   Extracted title: "${title}"`);

    // Try to find horses
    let horseCount = 0;
    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 5) {
        horseCount++;
      }
    });
    console.log(`   Rows that might be horses: ${horseCount}`);

    // Check if this looks like a valid race page
    if (title && title.length > 3 && !title.toLowerCase().includes('netkeiba')) {
      console.log(`   ✅ Looks like a valid race page!`);
      return { raceId, title, valid: true };
    } else {
      console.log(`   ❌ Doesn't look like a valid race page`);
      return null;
    }

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function runTests() {
  console.log('🧪 Testing known race IDs from October 2025\n');
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
  console.log(`   Valid races found: ${results.length}/${KNOWN_RACE_IDS.length}`);
  
  if (results.length > 0) {
    console.log('\n   ✅ Valid races:');
    results.forEach(r => {
      console.log(`      ${r.raceId}: ${r.title}`);
    });
    console.log('\n   💡 The scraper CAN access race pages!');
    console.log('      The issue is likely with race ID generation.');
  } else {
    console.log('\n   ❌ NO valid races found!');
    console.log('      Possible issues:');
    console.log('      - Netkeiba is blocking automated requests');
    console.log('      - Race results not yet available (future races)');
    console.log('      - Network/firewall blocking the requests');
    console.log('      - Check the saved HTML files to see what was returned');
  }

  console.log('\n💡 Next steps:');
  console.log('   1. Check the saved HTML files (race_*.html)');
  console.log('   2. Open them in a browser to see what they contain');
  console.log('   3. Compare with the actual race page on netkeiba.com');
}

runTests().catch(console.error);
