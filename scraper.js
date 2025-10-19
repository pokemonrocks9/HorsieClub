/**
 * scraper.js - JRA Race Scraper for GitHub Actions
 * 
 * This script runs daily via GitHub Actions and scrapes
 * all JRA races from the past 14 days, saving to races.json
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

const DAYS_BACK = 14;
const TRACK_MAP = {
  '01': 'Sapporo', '02': 'Hakodate', '03': 'Fukushima', '04': 'Niigata',
  '05': 'Tokyo', '06': 'Nakayama', '07': 'Chukyo', '08': 'Kyoto',
  '09': 'Hanshin', '10': 'Kokura'
};

// Generate race IDs for the past 14 days
function generateRaceIds() {
  const raceIds = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - (DAYS_BACK * 24 * 60 * 60 * 1000));

  for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    
    // Only weekends (0=Sun, 6=Sat) and Mondays (1) - JRA race days
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && dayOfWeek !== 1) {
      continue;
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    // Check all tracks
    for (let track = 1; track <= 10; track++) {
      const trackStr = String(track).padStart(2, '0');
      
      // Try 12 races per track per day
      for (let raceNum = 1; raceNum <= 12; raceNum++) {
        const raceStr = String(raceNum).padStart(2, '0');
        raceIds.push(`${dateStr}${trackStr}${raceStr}`);
      }
    }
  }

  return raceIds;
}

async function fetchRaceDetails(raceId) {
  const year = raceId.substring(0, 4);
  const month = raceId.substring(4, 6);
  const day = raceId.substring(6, 8);
  const trackCode = raceId.substring(8, 10);

  const url = `https://en.netkeiba.com/race/race_result.html?race_id=${raceId}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Check if this is a valid race result page
    if (!html.includes('Full Result') && $('table').length === 0) {
      return null;
    }

    // Extract title
    let title = $('h1').first().text().trim();
    title = title.replace(/\(G[123]\)/g, '').trim();

    // Extract grade
    const gradeMatch = $('h1').first().text().match(/\(G([123])\)/);
    const grade = gradeMatch ? `G${gradeMatch[1]}` : '';

    // Extract distance and surface
    const raceInfo = $('body').text();
    const distanceMatch = raceInfo.match(/([TD])(\d+)m/);
    const distance = distanceMatch ? `${distanceMatch[2]}m` : 'Unknown';
    const surface = distanceMatch ? (distanceMatch[1] === 'T' ? 'Turf' : 'Dirt') : 'Turf';

    // Extract horses
    const horses = [];
    const seen = new Set();

    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 6) {
        try {
          const ppText = $(cells[2]).text().trim();
          const pp = parseInt(ppText);
          const horseName = $(cells[3]).text().trim();
          const jockey = $(cells[5]).text().trim();

          if (!isNaN(pp) && horseName && jockey && pp > 0 && !seen.has(pp)) {
            seen.add(pp);
            horses.push({ number: pp, name: horseName, jockey: jockey });
          }
        } catch (e) {
          // Skip invalid rows
        }
      }
    });

    horses.sort((a, b) => a.number - b.number);

    if (horses.length === 0) return null;

    return {
      title: title || 'Unknown Race',
      grade,
      date: `${year}-${month}-${day}`,
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
  console.log('Starting race scraper...');
  const raceIds = generateRaceIds();
  console.log(`Generated ${raceIds.length} possible race IDs`);

  const races = [];
  let id = 1;

  // Process in batches to avoid overwhelming the server
  const BATCH_SIZE = 10;
  for (let i = 0; i < raceIds.length; i += BATCH_SIZE) {
    const batch = raceIds.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(raceIds.length / BATCH_SIZE)}...`);

    const results = await Promise.allSettled(
      batch.map(raceId => fetchRaceDetails(raceId))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        result.value.id = id++;
        races.push(result.value);
      }
    }

    // Small delay between batches
    if (i + BATCH_SIZE < raceIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  races.sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log(`Successfully scraped ${races.length} races`);

  // Save to JSON file
  fs.writeFileSync('races.json', JSON.stringify(races, null, 2));
  console.log('Saved to races.json');
}

scrapeRaces().catch(console.error);
