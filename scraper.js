/**
 * scraper.js - JRA Race Scraper that Actually Works!
 * 
 * This scrapes the English Netkeiba calendar to get real race IDs,
 * then fetches details for each race.
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

const TRACK_MAP = {
  '01': 'Sapporo', '02': 'Hakodate', '03': 'Fukushima', '04': 'Niigata',
  '05': 'Tokyo', '06': 'Nakayama', '07': 'Chukyo', '08': 'Kyoto',
  '09': 'Hanshin', '10': 'Kokura'
};

// Scrape race IDs from the main race list page
async function scrapeRaceIds() {
  console.log('Fetching race IDs from Netkeiba race calendar...');
  const raceIds = new Set();
  
  // Try the main race list page
  const url = 'https://en.netkeiba.com/race/';
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find all links with race_id parameter
    $('a[href*="race_id="]').each((i, elem) => {
      const href = $(elem).attr('href');
      const match = href.match(/race_id=(\d{12})/);
      if (match) {
        raceIds.add(match[1]);
      }
    });

    console.log(`Found ${raceIds.size} race IDs from main page`);
    
    // Also try to get recent dates
    const today = new Date();
    for (let daysBack = 0; daysBack < 30; daysBack++) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      const dateUrl = `https://en.netkeiba.com/race/?year=${year}&month=${month}&day=${day}`;
      
      try {
        console.log(`Checking date: ${year}-${month}-${day}`);
        const dateResponse = await fetch(dateUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        if (dateResponse.ok) {
          const dateHtml = await dateResponse.text();
          const $date = cheerio.load(dateHtml);
          
          let foundOnDate = 0;
          $date('a[href*="race_id="]').each((i, elem) => {
            const href = $date(elem).attr('href');
            const match = href.match(/race_id=(\d{12})/);
            if (match && !raceIds.has(match[1])) {
              raceIds.add(match[1]);
              foundOnDate++;
            }
          });
          
          if (foundOnDate > 0) {
            console.log(`  → Found ${foundOnDate} new races`);
          }
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`  → Error checking ${year}-${month}-${day}: ${error.message}`);
      }
    }

    return Array.from(raceIds);
    
  } catch (error) {
    console.error('Error scraping race IDs:', error);
    return [];
  }
}

async function fetchRaceDetails(raceId) {
  const url = `https://en.netkeiba.com/race/result.html?race_id=${raceId}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title from the page
    let title = $('h1').first().text().trim();
    if (!title) {
      title = $('.RaceName').first().text().trim();
    }
    if (!title) {
      // Try to get it from the title tag
      title = $('title').text().split('|')[0].trim();
    }
    if (!title || title === '') return null;
    
    // Clean up title - remove grade from title text
    const cleanTitle = title.replace(/\(G[123]\)/g, '').replace(/\s+/g, ' ').trim();

    // Extract grade
    const gradeMatch = title.match(/\(G([123])\)/);
    const grade = gradeMatch ? `G${gradeMatch[1]}` : '';

    // Extract date and track from race ID
    const year = raceId.substring(0, 4);
    const trackCode = raceId.substring(4, 6);
    
    // Try to find the actual date in the page
    let raceDate = `${year}-01-01`; // fallback
    const dateText = $('.RaceData01, .race_place').first().text();
    const dateMatch = dateText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (dateMatch) {
      const [, y, m, d] = dateMatch;
      raceDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    // Extract distance and surface
    const raceInfo = $('body').text();
    let distance = 'Unknown';
    let surface = 'Turf';
    
    // Look for patterns like "T1600m" or "D1800m"
    const distanceMatch = raceInfo.match(/([TD])(\d{3,4})m/);
    if (distanceMatch) {
      distance = `${distanceMatch[2]}m`;
      surface = distanceMatch[1] === 'T' ? 'Turf' : 'Dirt';
    }

    // Extract horses from results table
    const horses = [];
    const seen = new Set();

    // Look for the results table
    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      
      if (cells.length >= 5) {
        try {
          // Typical table structure: Finish | Frame | Post | Horse | Age/Sex | ... | Jockey
          // We need Post Position (usually 3rd column) and Horse Name (usually 4th column)
          
          let pp = null;
          let horseName = null;
          let jockey = null;
          
          // Try to find post position (number between 1-18)
          for (let idx = 0; idx < Math.min(4, cells.length); idx++) {
            const text = $(cells[idx]).text().trim();
            const num = parseInt(text);
            if (!isNaN(num) && num >= 1 && num <= 18) {
              pp = num;
              
              // Horse name should be in the next non-numeric cell
              for (let j = idx + 1; j < cells.length; j++) {
                const candidateName = $(cells[j]).text().trim();
                if (candidateName && candidateName.length > 1 && !/^\d+$/.test(candidateName)) {
                  horseName = candidateName;
                  break;
                }
              }
              break;
            }
          }
          
          // Find jockey (usually in last few columns, contains letters)
          for (let idx = cells.length - 1; idx >= Math.max(0, cells.length - 4); idx--) {
            const text = $(cells[idx]).text().trim();
            if (text && text.length > 2 && /[A-Za-z]/.test(text) && !/^\d+$/.test(text)) {
              jockey = text;
              break;
            }
          }

          if (pp && horseName && jockey && !seen.has(pp)) {
            seen.add(pp);
            horses.push({ 
              number: pp, 
              name: horseName.substring(0, 50), // Limit length
              jockey: jockey.substring(0, 30) 
            });
          }
        } catch (e) {
          // Skip invalid rows
        }
      }
    });

    horses.sort((a, b) => a.number - b.number);

    if (horses.length < 3) {
      // Not a valid race if less than 3 horses
      return null;
    }

    return {
      title: cleanTitle,
      grade,
      date: raceDate,
      track: TRACK_MAP[trackCode] || 'Unknown',
      distance,
      surface,
      horses,
      videoUrl: 'https://japanracing.jp/en/',
      resultsUrl: url,
    };

  } catch (error) {
    console.error(`Error fetching ${raceId}: ${error.message}`);
    return null;
  }
}

async function scrapeRaces() {
  console.log('🏇 Starting JRA Race Scraper...\n');
  
  // Step 1: Get all race IDs
  const raceIds = await scrapeRaceIds();
  
  if (raceIds.length === 0) {
    console.log('❌ No race IDs found. Check your internet connection and try again.');
    return;
  }
  
  console.log(`\n✅ Found ${raceIds.length} total race IDs`);
  console.log(`📋 Sample IDs: ${raceIds.slice(0, 5).join(', ')}\n`);
  
  // Step 2: Fetch details for each race
  const races = [];
  let id = 1;
  let successCount = 0;
  let failCount = 0;
  let gradedCount = 0;

  const BATCH_SIZE = 5;
  const totalBatches = Math.ceil(raceIds.length / BATCH_SIZE);
  
  for (let i = 0; i < raceIds.length; i += BATCH_SIZE) {
    const batch = raceIds.slice(i, i + BATCH_SIZE);
    const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
    
    process.stdout.write(`\rProcessing batch ${currentBatch}/${totalBatches}... `);

    const results = await Promise.allSettled(
      batch.map(raceId => fetchRaceDetails(raceId))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        result.value.id = id++;
        races.push(result.value);
        successCount++;
        if (result.value.grade) {
          gradedCount++;
        }
      } else {
        failCount++;
      }
    }

    // Delay between batches to be respectful
    if (i + BATCH_SIZE < raceIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n\n✅ Scraping complete!`);
  console.log(`   Total races: ${races.length}`);
  console.log(`   Graded stakes: ${gradedCount}`);
  console.log(`   Failed: ${failCount}\n`);

  // Sort by date (most recent first)
  races.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Show sample of what we got
  if (races.length > 0) {
    console.log('📊 Sample races:');
    races.slice(0, 5).forEach(race => {
      const gradeStr = race.grade ? ` [${race.grade}]` : '';
      console.log(`   ${race.date} - ${race.title}${gradeStr} (${race.horses.length} horses)`);
    });
  }

  // Save to JSON file
  fs.writeFileSync('races.json', JSON.stringify(races, null, 2));
  console.log(`\n💾 Saved to races.json`);
  
  // Also create a summary
  const summary = {
    lastUpdated: new Date().toISOString(),
    totalRaces: races.length,
    gradedStakes: gradedCount,
    dateRange: races.length > 0 ? {
      earliest: races[races.length - 1].date,
      latest: races[0].date
    } : null
  };
  
  console.log('\n📈 Summary:');
  console.log(JSON.stringify(summary, null, 2));
}

scrapeRaces().catch(console.error);
