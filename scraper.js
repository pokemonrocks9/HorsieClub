/**
 * scraper-entries.js - Spoiler-Free Race Scraper (FULLY FIXED)
 * 
 * FIXES:
 * - Dynamic year (was hardcoded to 2025!)
 * - Fukushima in 3rd position
 * - Extended date range (90 days back, 30 forward)
 * - Better error handling
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

const TRACK_MAP = {
  '01': 'Sapporo', '02': 'Hakodate', '03': 'Fukushima', '04': 'Niigata',
  '05': 'Tokyo', '06': 'Nakayama', '07': 'Chukyo', '08': 'Kyoto',
  '09': 'Hanshin', '10': 'Kokura'
};

// Generate possible race IDs focusing on recent race meetings
function generateRecentRaceIds() {
  const raceIds = [];
  const currentYear = new Date().getFullYear(); // FIXED: Dynamic year!
  
  console.log(`Current year: ${currentYear}`);
  
  // FIXED: Reorder tracks to check Fukushima earlier
  const tracks = [
    '05', // Tokyo
    '08', // Kyoto
    '03', // Fukushima - MOVED UP!
    '06', // Nakayama
    '09', // Hanshin
    '04', // Niigata
    '07', // Chukyo
    '10', // Kokura
    '01', // Sapporo (summer only)
    '02', // Hakodate (summer only)
  ];
  
  // Meetings - check more for new year rollover
  const meetings = ['08', '07', '06', '05', '04', '03', '02', '01'];
  
  // Days 01-12 (typical race meeting is 2-4 days)
  const days = ['12', '11', '10', '09', '08', '07', '06', '05', '04', '03', '02', '01'];
  
  // Races 01-12
  const races = ['12', '11', '10', '09', '08', '07', '06', '05', '04', '03', '02', '01'];
  
  // Generate IDs for all combinations
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
  
  console.log(`Generated ${raceIds.length} race IDs across all ${tracks.length} tracks`);
  console.log(`Checking meetings 01-08`);
  console.log(`Sample IDs: ${raceIds.slice(0, 5).join(', ')}`);
  
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
    
    // EXTRACT RACE NUMBER from race ID (last 2 digits)
    const raceNumber = parseInt(raceId.substring(10, 12));
    
    // Find date in page title - format: "RACE NAME | DD MMM YYYY"
    let raceDate = null;
    
    // Get body text once for all date pattern checks
    const bodyText = $('body').text();
    
    // Try multiple date patterns
    const dateMatch1 = pageTitle.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/i);
    const dateMatch2 = pageTitle.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    const dateMatch3 = bodyText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    
    if (dateMatch1) {
      // Format: 19 OCT 2025
      const monthMap = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
      };
      const day = dateMatch1[1];
      const month = monthMap[dateMatch1[2].toUpperCase()];
      const year = dateMatch1[3];
      raceDate = `${year}-${month}-${String(day).padStart(2, '0')}`;
    } else if (dateMatch2) {
      // Format: 2025-10-19 or 2025/10/19
      raceDate = `${dateMatch2[1]}-${String(dateMatch2[2]).padStart(2, '0')}-${String(dateMatch2[3]).padStart(2, '0')}`;
    } else if (dateMatch3) {
      // Format: 2025/10/19 in body
      raceDate = `${dateMatch3[1]}-${String(dateMatch3[2]).padStart(2, '0')}-${String(dateMatch3[3]).padStart(2, '0')}`;
    }
    
    // FIXED: Extended date range - 90 days back, 30 days forward
    if (raceDate) {
      const raceTime = new Date(raceDate).getTime();
      const now = Date.now();
      const daysAgo = (now - raceTime) / (1000 * 60 * 60 * 24);
      if (daysAgo > 90 || daysAgo < -30) {  // Keep races up to 90 days old, 30 days in future
        return null;
      }
    } else {
      return null;
    }

    // Extract distance and surface from page
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

    // Target rows with class "HorseList"
    $('tr.HorseList').each((i, row) => {
      const $row = $(row);
      const cells = $row.find('td');
      
      if (cells.length >= 7) {
        // Column 2 (index 1) = Post Position
        const ppText = $(cells[1]).text().trim();
        const pp = parseInt(ppText);
        
        // Column 4 (index 3) = Horse Info
        const horseName = $(cells[3]).find('a').first().text().trim()
          .replace(/\s*\u00a0.*$/, '')
          .trim();
        
        // Column 7 (index 6) = Jockey
        const jockey = $(cells[6]).text().trim();
        
        // Validate
        if (pp && pp >= 1 && pp <= 20 && 
            horseName && horseName.length >= 2 && 
            jockey && jockey.length >= 2 &&
            !seen.has(pp)) {
          seen.add(pp);
          horses.push({ 
            number: pp, 
            name: horseName.substring(0, 50),
            jockey: jockey.substring(0, 30)
          });
        }
      }
    });

    horses.sort((a, b) => a.number - b.number);

    // Need at least 4 horses for a valid race
    if (horses.length < 4) {
      return null;
    }

    return {
      title: cleanTitle,
      raceNumber,
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
    // Log first error to help diagnose network issues
    if (!this.firstErrorLogged) {
      console.error(`\n⚠️  First fetch error: ${error.message}`);
      this.firstErrorLogged = true;
    }
    return null;
  }
}

async function scrapeRaces() {
  console.log('🏇 Spoiler-Free Race Scraper\n');
  console.log(`⏰ Run time: ${new Date().toISOString()}\n`);
  
  const raceIds = generateRecentRaceIds();
  console.log(`📋 Checking ${raceIds.length} possible race IDs...\n`);
  
  const races = [];
  let id = 1;
  let successCount = 0;
  let gradedCount = 0;
  let checkedCount = 0;

  const BATCH_SIZE = 15;
  const TOTAL_TO_CHECK = 7200; // Check everything
  const idsToCheck = raceIds.slice(0, TOTAL_TO_CHECK);
  const totalBatches = Math.ceil(idsToCheck.length / BATCH_SIZE);
  
  console.log(`🔍 Checking ${TOTAL_TO_CHECK} race IDs for entries across all tracks...\n`);
  
  let firstSuccess = null;
  
  for (let i = 0; i < idsToCheck.length; i += BATCH_SIZE) {
    const batch = idsToCheck.slice(i, i + BATCH_SIZE);
    const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
    
    process.stdout.write(`\rBatch ${currentBatch}/${totalBatches} | Found: ${successCount} races (${gradedCount} graded) | Checked: ${checkedCount}`);

    const results = await Promise.allSettled(
      batch.map(raceId => fetchRaceEntries(raceId))
    );

    for (let idx = 0; idx < results.length; idx++) {
      const result = results[idx];
      const raceId = batch[idx];
      
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
          console.log(`   Race ID: ${raceId}`);
          console.log(`   Track: ${result.value.track}`);
          console.log(`   Date: ${result.value.date}`);
          console.log(`   Horses: ${result.value.horses.length}\n`);
        }
      }
    }

    // Delay between batches
    await new Promise(resolve => setTimeout(resolve, 400));
  }

  console.log(`\n✅ Scraping complete!`);
  console.log(`   Total races found: ${races.length}`);
  console.log(`   Graded stakes: ${gradedCount}`);
  console.log(`   IDs checked: ${checkedCount}\n`);
  
  // Show track breakdown
  const trackCounts = {};
  races.forEach(race => {
    trackCounts[race.track] = (trackCounts[race.track] || 0) + 1;
  });
  console.log('📊 Races by track:');
  Object.entries(trackCounts).sort((a, b) => b[1] - a[1]).forEach(([track, count]) => {
    console.log(`   ${track}: ${count} races`);
  });
  
  // Show date breakdown
  const dateCounts = {};
  races.forEach(race => {
    dateCounts[race.date] = (dateCounts[race.date] || 0) + 1;
  });
  console.log('\n📅 Races by date:');
  Object.entries(dateCounts).sort().forEach(([date, count]) => {
    console.log(`   ${date}: ${count} races`);
  });
  
  if (races.length === 0) {
    console.log('\n::error::No races found!');
    console.log('Possible causes:');
    console.log('  1. Network issue - GitHub Actions may be blocked by netkeiba.com');
    console.log('  2. No races scheduled in the date range');
    console.log('  3. Meeting numbers need adjustment for new year');
    console.log('\nRun scraper-diagnostic.js for more details');
  } else {
    console.log('\n::notice::Scraping completed successfully');
    console.log(`::notice::Found ${races.length} races (${gradedCount} graded stakes)`);
  }

  // Sort by date (most recent first)
  races.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Show sample
  if (races.length > 0) {
    console.log('\n📊 Recent races found:');
    races.slice(0, 15).forEach(race => {
      const gradeStr = race.grade ? ` [${race.grade}]` : '';
      console.log(`   ${race.date} - ${race.track} R${race.raceNumber} ${race.title}${gradeStr}`);
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
