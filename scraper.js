/**
 * scraper.js - JRA Race Scraper - SIMPLIFIED VERSION
 * 
 * This version uses a brute-force approach: it tries all possible
 * race IDs for recent dates and successful tracks/meetings
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

const TRACK_MAP = {
  '01': 'Sapporo', '02': 'Hakodate', '03': 'Fukushima', '04': 'Niigata',
  '05': 'Tokyo', '06': 'Nakayama', '07': 'Chukyo', '08': 'Kyoto',
  '09': 'Hanshin', '10': 'Kokura'
};

// Generate possible race IDs using a smarter approach
function generatePossibleRaceIds() {
  const raceIds = [];
  const currentYear = 2025;
  
  // For JRA, the format is: YYYY + PP (place) + KK (kai/meeting) + DD (day) + RR (race)
  // We'll try common meeting numbers (01-06) and days (01-12) for each track
  
  const tracks = ['05', '06', '07', '08', '09', '04', '03', '10']; // Most active tracks first
  const meetings = ['01', '02', '03', '04', '05', '06', '07', '08']; // Meeting numbers
  const days = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']; // Days in meeting
  const races = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']; // Race numbers
  
  // Focus on recent meetings (higher meeting numbers = later in year)
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

async function fetchRaceDetails(raceId) {
  const url = `https://en.netkeiba.com/race/result.html?race_id=${raceId}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    
    // Quick check - if page doesn't have result content, skip it
    if (!html.includes('Full Result') && !html.includes('result') && html.length < 10000) {
      return null;
    }

    const $ = cheerio.load(html);

    // Extract title
    let title = $('h1').first().text().trim();
    if (!title || title.length < 3) {
      title = $('title').text().split('|')[0].trim();
    }
    if (!title || title.length < 3 || title.toLowerCase().includes('netkeiba')) return null;
    
    const cleanTitle = title.replace(/\(G[123]\)/g, '').replace(/\s+/g, ' ').trim();

    // Extract grade
    const gradeMatch = title.match(/\(G([123])\)/);
    const grade = gradeMatch ? `G${gradeMatch[1]}` : '';

    // Extract date and track from race ID
    const year = raceId.substring(0, 4);
    const trackCode = raceId.substring(4, 6);
    
    // Find date in page
    let raceDate = null;
    const bodyText = $('body').text();
    const dateMatch = bodyText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (dateMatch) {
      const [, y, m, d] = dateMatch;
      raceDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    
    // Only keep races from the past 45 days
    if (raceDate) {
      const raceTime = new Date(raceDate).getTime();
      const now = Date.now();
      const daysAgo = (now - raceTime) / (1000 * 60 * 60 * 24);
      if (daysAgo > 45 || daysAgo < -7) { // Skip races more than 45 days old or more than 7 days in future
        return null;
      }
    } else {
      return null; // Skip races without a valid date
    }

    // Extract distance and surface
    let distance = 'Unknown';
    let surface = 'Turf';
    const distanceMatch = bodyText.match(/([TD])(\d{3,4})m/);
    if (distanceMatch) {
      distance = `${distanceMatch[2]}m`;
      surface = distanceMatch[1] === 'T' ? 'Turf' : 'Dirt';
    }

    // Extract horses
    const horses = [];
    const seen = new Set();

    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      
      if (cells.length >= 5) {
        try {
          let pp = null;
          let horseName = null;
          let jockey = null;
          
          // Find post position
          for (let idx = 0; idx < Math.min(4, cells.length); idx++) {
            const text = $(cells[idx]).text().trim();
            const num = parseInt(text);
            if (!isNaN(num) && num >= 1 && num <= 18) {
              pp = num;
              
              // Horse name in next cell
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
          
          // Find jockey
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
              name: horseName.substring(0, 50),
              jockey: jockey.substring(0, 30) 
            });
          }
        } catch (e) {
          // Skip
        }
      }
    });

    horses.sort((a, b) => a.number - b.number);

    if (horses.length < 4) {
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
    return null;
  }
}

async function scrapeRaces() {
  console.log('🏇 Starting JRA Race Scraper (Brute Force Method)...\n');
  console.log(`⏰ Run time: ${new Date().toISOString()}\n`);
  
  const raceIds = generatePossibleRaceIds();
  console.log(`📋 Generated ${raceIds.length} possible race IDs to check\n`);
  
  const races = [];
  let id = 1;
  let successCount = 0;
  let failCount = 0;
  let gradedCount = 0;
  let checkedCount = 0;

  const BATCH_SIZE = 10; // Check 10 at a time
  const TOTAL_TO_CHECK = 2000; // Only check first 2000 to save time
  const idsToCheck = raceIds.slice(0, TOTAL_TO_CHECK);
  const totalBatches = Math.ceil(idsToCheck.length / BATCH_SIZE);
  
  console.log(`🔍 Checking first ${TOTAL_TO_CHECK} race IDs...\n`);
  
  for (let i = 0; i < idsToCheck.length; i += BATCH_SIZE) {
    const batch = idsToCheck.slice(i, i + BATCH_SIZE);
    const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
    
    process.stdout.write(`\rBatch ${currentBatch}/${totalBatches} | Found: ${successCount} races (${gradedCount} graded) | Checked: ${checkedCount}`);

    const results = await Promise.allSettled(
      batch.map(raceId => fetchRaceDetails(raceId))
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
      } else {
        failCount++;
      }
    }

    // Delay between batches
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`\n\n✅ Scraping complete!`);
  console.log(`   Total races found: ${races.length}`);
  console.log(`   Graded stakes: ${gradedCount}`);
  console.log(`   IDs checked: ${checkedCount}`);
  console.log(`   Failed: ${failCount}\n`);
  
  if (races.length === 0) {
    console.log('::error::No races found! The scraper may need adjustment.');
    process.exit(1);
  }
  
  console.log('::notice::Scraping completed successfully');
  console.log(`::notice::Found ${races.length} races (${gradedCount} graded stakes)`);

  // Sort by date (most recent first)
  races.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Show sample
  if (races.length > 0) {
    console.log('📊 Sample races found:');
    races.slice(0, 10).forEach(race => {
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
    } : null
  };
  
  console.log('\n📈 Summary:');
  console.log(JSON.stringify(summary, null, 2));
}

scrapeRaces().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
