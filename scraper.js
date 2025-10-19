/**
 * scraper-entries.js - Spoiler-Free Race Scraper
 * 
 * This scrapes ENTRY LISTS (shutuba.html) NOT results,
 * so you can see horses and pick winners without spoilers!
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

const TRACK_MAP = {
  '01': 'Sapporo', '02': 'Hakodate', '03': 'Fukushima', '04': 'Niigata',
  '05': 'Tokyo', '06': 'Nakayama', '07': 'Chukyo', '08': 'Kyoto',
  '09': 'Hanshin', '10': 'Kokura'
};

// Generate possible race IDs for the past week
function generateRecentRaceIds() {
  const raceIds = [];
  const currentYear = 2025;
  
  // Focus on active tracks and recent meetings
  const tracks = ['05', '06', '07', '08', '09', '04']; // Tokyo, Nakayama, Chukyo, Kyoto, Hanshin, Niigata
  const meetings = ['08', '07', '06', '05', '04', '03']; // Recent meetings (reverse order)
  const days = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const races = ['11', '10', '09', '08', '07', '06', '05', '04', '03', '02', '01']; // Main races first
  
  for (const track of tracks) {
    for (const meeting of meetings) {
      for (const day of days) {
        for (const race of races) {
          const raceId = `${currentYear}${track}${meeting}${day}${race}`;
          raceIds.push(raceId);
        }
      }
    }
  }
  
  return raceIds;
}

async function fetchRaceEntries(raceId) {
  // Use the ENTRIES page (shutuba.html) not results page
  const url = `https://en.netkeiba.com/race/shutuba.html?race_id=${raceId}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    
    // Quick check - if page doesn't have field content, skip
    if (!html.includes('Field') && html.length < 5000) {
      return null;
    }

    const $ = cheerio.load(html);

    // Extract title - from page title since H1 is often empty
    const pageTitle = $('title').text();
    let title = pageTitle.split('|')[0].trim();
    
    // Also check for race name in the page
    if (!title || title.length < 3) {
      title = $('h1').first().text().trim();
    }
    
    // If still no title or it's generic, skip
    if (!title || title.length < 3 || title.toLowerCase().includes('netkeiba')) {
      return null;
    }
    
    const cleanTitle = title.replace(/\(G[123]\)/g, '').replace(/\s+/g, ' ').trim();

    // Extract grade
    const gradeMatch = pageTitle.match(/\(G([123])\)/);
    const grade = gradeMatch ? `G${gradeMatch[1]}` : '';

    // Extract date and track
    const year = raceId.substring(0, 4);
    const trackCode = raceId.substring(4, 6);
    
    // Find date in page title - format: "RACE NAME | DD MMM YYYY"
    let raceDate = null;
    const dateMatch = pageTitle.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/i);
    
    if (dateMatch) {
      const monthMap = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
      };
      const day = dateMatch[1];
      const month = monthMap[dateMatch[2].toUpperCase()];
      const year = dateMatch[3];
      raceDate = `${year}-${month}-${String(day).padStart(2, '0')}`;
    }
    
    // Only keep races from the past 14 days
    if (raceDate) {
      const raceTime = new Date(raceDate).getTime();
      const now = Date.now();
      const daysAgo = (now - raceTime) / (1000 * 60 * 60 * 24);
      if (daysAgo > 14 || daysAgo < -2) {
        return null;
      }
    } else {
      return null;
    }

    // Extract distance and surface from page
    const bodyText = $('body').text();
    let distance = 'Unknown';
    let surface = 'Turf';
    const distanceMatch = bodyText.match(/([TD])(\d{3,4})m/);
    if (distanceMatch) {
      distance = `${distanceMatch[2]}m`;
      surface = distanceMatch[1] === 'T' ? 'Turf' : 'Dirt';
    }

    // Extract horses from ENTRY table
    const horses = [];
    const seen = new Set();

    // Parse all table rows - Netkeiba format is usually:
    // Gate | Post | Horse | Age/Sex | Jockey | Weight | Trainer | etc.
    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      
      if (cells.length >= 5) {
        const cellTexts = cells.map((i, el) => $(el).text().trim()).get();
        
        let pp = null;
        let horseName = null;
        let jockey = null;
        
        // Look in first 2 cells for post position
        for (let idx = 0; idx <= 1; idx++) {
          const text = cellTexts[idx];
          const num = parseInt(text);
          // Must be clean number 1-20, exact match
          if (!isNaN(num) && num >= 1 && num <= 20 && text === String(num)) {
            pp = num;
            
            // Horse name: next cell with letters, 2+ chars
            for (let j = idx + 1; j <= idx + 3 && j < cellTexts.length; j++) {
              const candidate = cellTexts[j];
              if (candidate && 
                  candidate.length >= 2 && 
                  /[a-zA-Z]/.test(candidate) &&
                  !candidate.match(/^\d+$/) &&
                  !candidate.match(/^\d+kg$/) &&
                  !candidate.match(/^[MFC]$/)) {  // Not sex indicators
                horseName = candidate;
                break;
              }
            }
            
            // Jockey: usually 2-5 cells after post position
            for (let j = idx + 3; j <= idx + 6 && j < cellTexts.length; j++) {
              const candidate = cellTexts[j];
              if (candidate && 
                  candidate.length >= 4 && 
                  candidate.length <= 30 &&
                  /[A-Za-z]/.test(candidate) &&
                  /[.A-Z]/.test(candidate) &&  // Usually has capitals or dots (M. Demuro)
                  !candidate.match(/^\d+$/) &&
                  !candidate.includes('kg') &&
                  candidate !== horseName) {
                jockey = candidate;
                break;
              }
            }
            break;
          }
        }

        if (pp && horseName && jockey && !seen.has(pp)) {
          seen.add(pp);
          horses.push({ 
            number: pp, 
            name: horseName.substring(0, 50).trim(),
            jockey: jockey.substring(0, 30).trim()
          });
        }
      }
    });

    horses.sort((a, b) => a.number - b.number);

    // Need at least 5 horses for a valid race
    if (horses.length < 5) {
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
      resultsUrl: `https://en.netkeiba.com/race/result.html?race_id=${raceId}`,
      entriesUrl: url,
    };

  } catch (error) {
    return null;
  }
}

async function scrapeRaces() {
  console.log('🏇 Spoiler-Free Race Scraper (Past 2 Weeks)\n');
  console.log(`⏰ Run time: ${new Date().toISOString()}\n`);
  
  const raceIds = generateRecentRaceIds();
  console.log(`📋 Checking ${raceIds.length} possible race IDs...\n`);
  
  const races = [];
  let id = 1;
  let successCount = 0;
  let gradedCount = 0;
  let checkedCount = 0;

  const BATCH_SIZE = 10;
  const TOTAL_TO_CHECK = 800; // Check 800 IDs (faster for testing)
  const idsToCheck = raceIds.slice(0, TOTAL_TO_CHECK);
  const totalBatches = Math.ceil(idsToCheck.length / BATCH_SIZE);
  
  console.log(`🔍 Checking ${TOTAL_TO_CHECK} race IDs for entries...\n`);
  
  let firstSuccess = null;
  
  for (let i = 0; i < idsToCheck.length; i += BATCH_SIZE) {
    const batch = idsToCheck.slice(i, i + BATCH_SIZE);
    const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
    
    process.stdout.write(`\rBatch ${currentBatch}/${totalBatches} | Found: ${successCount} races (${gradedCount} graded) | Checked: ${checkedCount}`);

    const results = await Promise.allSettled(
      batch.map(raceId => fetchRaceEntries(raceId))
    );

    for (const result of results) {
      checkedCount++;
      if (result.status === 'fulfilled' && result.value) {
        result.value.id = id++;
        races.push(result.value);
        successCount++;
        if (result.value.grade) {
          gradedCount++;
        }
        
        // Log first success
        if (!firstSuccess) {
          firstSuccess = result.value;
          console.log(`\n\n🎉 First race found: ${result.value.title}`);
          console.log(`   Date: ${result.value.date}`);
          console.log(`   Horses: ${result.value.horses.length}`);
          console.log(`   Sample: #${result.value.horses[0].number} ${result.value.horses[0].name} (${result.value.horses[0].jockey})\n`);
        }
      }
    }

    // Delay between batches
    await new Promise(resolve => setTimeout(resolve, 400));
  }

  console.log(`\n\n✅ Scraping complete!`);
  console.log(`   Total races found: ${races.length}`);
  console.log(`   Graded stakes: ${gradedCount}`);
  console.log(`   IDs checked: ${checkedCount}\n`);
  
  if (races.length === 0) {
    console.log('::warning::No races found in the past 2 weeks');
    console.log('This could mean:');
    console.log('  - Race IDs need adjustment');
    console.log('  - Netkeiba is blocking requests');
    console.log('  - No racing this week');
  } else {
    console.log('::notice::Scraping completed successfully');
    console.log(`::notice::Found ${races.length} races (${gradedCount} graded stakes)`);
  }

  // Sort by date (most recent first)
  races.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Show sample
  if (races.length > 0) {
    console.log('📊 Recent races found:');
    races.slice(0, 15).forEach(race => {
      const gradeStr = race.grade ? ` [${race.grade}]` : '';
      console.log(`   ${race.date} - ${race.title}${gradeStr} (${race.horses.length} horses)`);
    });
  }

  // Save to JSON
  fs.writeFileSync('races.json', JSON.stringify(races, null, 2));
  console.log(`\n💾 Saved ${races.length} races to races.json`);
  
  const summary = {
    lastUpdated: new Date().toISOString(),
    totalRaces: races.length,
    gradedStakes: gradedCount,
    dateRange: races.length > 0 ? {
      earliest: races[races.length - 1].date,
      latest: races[0].date
    } : null,
    note: 'Entry lists only - no spoilers!'
  };
  
  console.log('\n📈 Summary:');
  console.log(JSON.stringify(summary, null, 2));
}

scrapeRaces().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
