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

// Generate possible race IDs focusing on recent race meetings
function generateRecentRaceIds() {
  const raceIds = [];
  const currentYear = 2025;
  
  // ALL JRA tracks with priority order (most active tracks first)
  const tracks = [
    '05', // Tokyo
    '08', // Kyoto  
    '04', // Niigata
    '06', // Nakayama
    '09', // Hanshin
    '07', // Chukyo
    '10', // Kokura
    '03', // Fukushima
    '01', // Sapporo
    '02', // Hakodate
  ];
  
  // For October, meetings are typically 01-05 (not 10!)
  // Lower numbers = more recent in the current season
  const meetings = ['05', '04', '03', '02', '01'];
  
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
  console.log(`Checking meetings 01-05 (current season)`);
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
    
    // Only keep races from the past 21 days (3 weeks instead of 2)
    if (raceDate) {
      const raceTime = new Date(raceDate).getTime();
      const now = Date.now();
      const daysAgo = (now - raceTime) / (1000 * 60 * 60 * 24);
      if (daysAgo > 21 || daysAgo < -7) {  // Keep races up to 21 days old, 7 days in future
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

    // Extract horses from ENTRY table - FIXED PARSING
    const horses = [];
    const seen = new Set();

    // Target rows with class "HorseList" - this is the key!
    $('tr.HorseList').each((i, row) => {
      const $row = $(row);
      const cells = $row.find('td');
      
      if (cells.length >= 7) {
        // Column 2 (index 1) = Post Position
        const ppText = $(cells[1]).text().trim();
        const pp = parseInt(ppText);
        
        // Column 4 (index 3) = Horse Info (contains horse name in <a> tag)
        const horseName = $(cells[3]).find('a').first().text().trim()
          .replace(/\s*\u00a0.*$/, '') // Remove nbsp and everything after
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

    // Need at least 4 horses for a valid race (some small races exist)
    if (horses.length < 4) {
      return null;
    }

    return {
      title: cleanTitle,
      raceNumber, // ADD RACE NUMBER HERE
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
  console.log('🏇 Spoiler-Free Race Scraper (Past 3 Weeks)\n');
  console.log(`⏰ Run time: ${new Date().toISOString()}\n`);
  
  const raceIds = generateRecentRaceIds();
  console.log(`📋 Checking ${raceIds.length} possible race IDs...\n`);
  
  const races = [];
  let id = 1;
  let successCount = 0;
  let gradedCount = 0;
  let checkedCount = 0;

  const BATCH_SIZE = 15;
  const TOTAL_TO_CHECK = 3000;
  const idsToCheck = raceIds.slice(0, TOTAL_TO_CHECK);
  const totalBatches = Math.ceil(idsToCheck.length / BATCH_SIZE);
  
  console.log(`🔍 Checking ${TOTAL_TO_CHECK} race IDs for entries across all tracks...\n`);
  
  let firstSuccess = null;
  let firstAttemptLogged = false;
  
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
      
      // Log first few attempts to see what's happening
      if (!firstAttemptLogged && checkedCount <= 3) {
        console.log(`\n\nDEBUG: Checked race ID ${raceId}`);
        console.log(`  Result: ${result.status}`);
        if (result.status === 'fulfilled' && result.value) {
          console.log(`  Found: ${result.value.title}`);
        } else {
          console.log(`  Not found or invalid`);
        }
        if (checkedCount === 3) firstAttemptLogged = true;
      }
      
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
          console.log(`   Race Number: ${result.value.raceNumber}`);
          console.log(`   Date: ${result.value.date}`);
          console.log(`   Horses: ${result.value.horses.length}`);
          console.log(`   Sample: #${result.value.horses[0].number} ${result.value.horses[0].name} (${result.value.horses[0].jockey})\n`);
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
    console.log('::warning::No races found in the past 3 weeks');
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
    console.log('\n📊 Recent races found:');
    races.slice(0, 15).forEach(race => {
      const gradeStr = race.grade ? ` [${race.grade}]` : '';
      console.log(`   ${race.date} - R${race.raceNumber} ${race.title}${gradeStr} (${race.horses.length} horses)`);
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
