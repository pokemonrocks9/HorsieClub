// Global variables
let currentUser = '';
let currentSession = '';
let currentUserColor = '#f44336';
let selectedDate = '';
let selectedTrack = '';
let selectedRace = null;
let myPicks = new Set();
let races = [];
let poll = null;
let allSessionPicks = [];

const API_URL = 'https://horsie.tytygoins.workers.dev';
const GITHUB_RACES_URL = 'https://raw.githubusercontent.com/pokemonrocks9/HorsieClub/main/races.json';

function selectColor(color) {
    currentUserColor = color;
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('selected');
        if (opt.dataset.color === color) opt.classList.add('selected');
    });
    localStorage.setItem('userColor', color);
    applyTheme(color); // Apply theme immediately on color selection
}

function applyTheme(c) {
    const darker = darkenColor(c, 0.2);
    const lighter = lightenColor(c, 0.9);
    document.documentElement.style.setProperty('--accent', c);
    document.documentElement.style.setProperty('--accent-light', lighter);
    document.documentElement.style.setProperty('--accent-dark', darker);
    
    // Update PWA theme color to match dynamic accent
    const meta = document.getElementById('pwa-theme-color');
    if (meta) meta.setAttribute('content', c);

    // Force UI color updates for dynamic elements
    document.querySelectorAll('h1, .track-name, .race-number, .horse-number').forEach(e => {
        e.style.color = 'var(--accent)';
    });
    
    document.querySelectorAll('.btn').forEach(e => {
        if (!e.classList.contains('back-btn')) {
            e.style.background = 'var(--accent)';
            e.style.borderColor = 'var(--accent)';
        }
    });
    
    document.body.style.background = `linear-gradient(135deg, ${darker} 0%, ${darker} 100%)`; // Use darker for body background
    localStorage.setItem('userColor', c);
}

function darkenColor(hex, amt) {
    if (!hex.startsWith('#')) return hex;
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, Math.floor(r * (1 - amt)));
    g = Math.max(0, Math.floor(g * (1 - amt)));
    b = Math.max(0, Math.floor(b * (1 - amt)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lightenColor(hex, amt) {
    if (!hex.startsWith('#')) return hex;
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, Math.floor(r + (255 - r) * amt));
    g = Math.min(255, Math.floor(g + (255 - g) * amt));
    b = Math.min(255, Math.floor(b + (255 - b) * amt));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

window.addEventListener('DOMContentLoaded', async () => {
    const savedColor = localStorage.getItem('userColor');
    if (savedColor) {
        selectColor(savedColor);
        applyTheme(savedColor);
    } else {
        applyTheme(currentUserColor); // Apply default theme if no color saved
    }
    await autoCleanupOldSessions();
    refreshSessions();
    document.getElementById('sessionCode').addEventListener('input', updateSessionButton);
    renderViewFromUrl(); // Handle initial URL state
});

async function autoCleanupOldSessions() {
    try {
        await fetch(`${API_URL}/picks/old`, { method: 'DELETE' });
        console.log('✅ Auto-cleaned old sessions');
    } catch (e) {
        console.error('Auto-cleanup error:', e);
    }
    
    const keysToDelete = [];
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('_')) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.timestamp) {
                        const itemTime = new Date(parsed.timestamp).getTime();
                        if (itemTime < cutoffTime) keysToDelete.push(key);
                    }
                }
            } catch (e) { /* ignore malformed JSON */ }
        }
    }
    
    keysToDelete.forEach(key => localStorage.removeItem(key));
    if (keysToDelete.length > 0) console.log(`✅ Auto-cleaned ${keysToDelete.length} old localStorage entries`);
}

async function loadAllSessionPicks() {
    if (!currentSession) return;
    try {
        const response = await fetch(`${API_URL}/picks?session=${currentSession}`);
        if (response.ok) {
            const data = await response.json();
            allSessionPicks = data;
            console.log(`Loaded ${allSessionPicks.length} total picks for session`);
        } else {
            allSessionPicks = [];
        }
    } catch (e) {
        allSessionPicks = [];
        console.error('Error loading all session picks:', e);
    }
}

function hasPicksForDate(date) {
    return allSessionPicks.some(p => races.find(r => r.id === p.race_id && r.date === date));
}

function hasPicksForTrack(track) {
    return allSessionPicks.some(p => races.find(r => r.id === p.race_id && r.track === track && r.date === selectedDate));
}

function hasPicksForRace(raceId) {
    return allSessionPicks.some(p => p.race_id === raceId);
}

async function refreshSessions() {
    const container = document.getElementById('activeSessions');
    container.innerHTML = '<p style="color:#666;">Loading...</p>';
    
    try {
        const response = await fetch(`${API_URL}/picks/sessions`);
        if (!response.ok) {
            container.innerHTML = '<p style="color:#666;">API unavailable</p>';
            return;
        }
        
        const data = await response.json();
        console.log(`Found ${data.length} picks in last 24 hours`);
        
        const sessions = {};
        data.forEach(pick => {
            if (!sessions[pick.session_code]) {
                sessions[pick.session_code] = { users: new Set(), lastActivity: pick.created_at, count: 0 };
            }
            sessions[pick.session_code].users.add(pick.user_name);
            sessions[pick.session_code].count++;
        });
        
        if (Object.keys(sessions).length === 0) {
            container.innerHTML = '<p style="color:#666;">No active sessions in the last 24 hours</p>';
        } else {
            let html = '<div style="display:flex;flex-direction:column;gap:10px;">';
            for (const [code, info] of Object.entries(sessions)) {
                const userList = Array.from(info.users).join(', ');
                const timeAgo = getTimeAgo(new Date(info.lastActivity));
                html += `<div style="padding:10px;border:1px solid #e0e0e0;border-radius:5px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'"><div onclick="joinExistingSession('${code}')" style="flex:1;"><strong>${code}</strong><br><small style="color:#666;">Users: ${userList} • ${info.count} picks • ${timeAgo}</small></div><button onclick="event.stopPropagation();deleteSession('${code}')" style="background:#f44336;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;">Delete</button></div>`;
            }
            html += '</div>';
            container.innerHTML = html;
        }
    } catch (e) {
        console.error('Refresh exception:', e);
        container.innerHTML = '<p style="color:#666;">API unavailable</p>';
    }
}

function joinExistingSession(code) {
    document.getElementById('sessionCode').value = code;
    updateSessionButton();
}

function updateSessionButton() {
    const sessionCode = document.getElementById('sessionCode').value.trim();
    const btn = document.getElementById('sessionBtn');
    const activeSessions = document.querySelectorAll('#activeSessions strong');
    let isExisting = false;
    activeSessions.forEach(el => { if (el.textContent === sessionCode) isExisting = true; });
    btn.textContent = isExisting ? 'Join Session' : 'Create Session';
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

async function deleteSession(code) {
    if (!confirm(`Delete session "${code}" and all its picks?`)) return;
    console.log(`🗑️ Starting delete for session: ${code}`);
    
    try {
        const response = await fetch(`${API_URL}/picks/${code}`, { method: 'DELETE' });
        if (!response.ok) { alert('Error deleting session from API'); return; }
        console.log('✅ Deleted from API');
        
        const keysToDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`${code}_`)) keysToDelete.push(key);
        }
        keysToDelete.forEach(key => localStorage.removeItem(key));
        console.log(`✅ Deleted ${keysToDelete.length} localStorage keys`);
        
        alert(`✅ Deleted session "${code}"!`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await refreshSessions();
    } catch (e) {
        console.error('❌ Delete exception:', e);
        alert(`Error: ${e.message}`);
    }
}

async function clearAllSessions() {
    if (!confirm('⚠️ Delete ALL sessions? This cannot be undone!')) return;
    if (!confirm('Are you REALLY sure? This will delete everything!')) return;
    console.log('🗑️💥 Clearing ALL sessions...');
    
    try {
        const response = await fetch(`${API_URL}/picks/all`, { method: 'DELETE' });
        if (!response.ok) { alert('Error clearing all sessions'); return; }
        console.log('✅ Cleared ALL sessions from API');
        
        const localCount = localStorage.length;
        localStorage.clear();
        console.log(`✅ Cleared ALL localStorage (${localCount} entries)`);
        alert(`✅ ALL sessions deleted!`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        await refreshSessions();
    } catch (e) {
        console.error('❌ Clear all exception:', e);
        alert(`Error: ${e.message}`);
    }
}

async function joinSession() {
    const username = document.getElementById('username').value.trim();
    const sessionCode = document.getElementById('sessionCode').value.trim();
    if (!username || !sessionCode) { alert('Please enter both your name and a session code!'); return; }
    currentUser = username;
    currentSession = sessionCode;
    document.getElementById('setup').classList.add('hidden');
    await loadRaces();
    await loadAllSessionPicks(); // Load all picks for the session after joining
    showDateSelector();
    updateUrl('date', selectedDate); // Update URL for date selector view
}

async function loadRaces() {
    try {
        const response = await fetch(GITHUB_RACES_URL);
        races = await response.json();
        console.log(`✅ Loaded ${races.length} races`);
    } catch (e) {
        console.error('Race load error:', e);
        alert('Error loading races. Please try again.');
    }
}

async function refreshRaces() {
    await loadRaces();
    document.getElementById('trackSelector').classList.add('hidden');
    document.getElementById('raceSelector').classList.add('hidden');
    document.getElementById('raceDetail').classList.add('hidden');
    showDateSelector();
    alert(`Refreshed! Loaded ${races.length} races.`);
}

function showDateSelector() {
    document.getElementById('headerTitle').textContent = '🏇 Select a Race Day';
    document.getElementById('backToHomeBtn').classList.remove('hidden');
    const racesByDate = {};
    races.forEach(race => {
        if (!race.date) return;
        if (!racesByDate[race.date]) racesByDate[race.date] = [];
        racesByDate[race.date].push(race);
    });
    
    const grid = document.getElementById('dateGrid');
    grid.innerHTML = '';
    const dates = Object.keys(racesByDate).sort((a, b) => new Date(a) - new Date(b));
    
    dates.forEach(date => {
        const dateObj = new Date(date + 'T00:00:00');
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const card = document.createElement('div');
        card.className = 'selector-card';
        if (hasPicksForDate(date)) card.classList.add('has-picks');
        card.onclick = () => selectDate(date);
        card.innerHTML = `<div class="date-info"><div class="date-badge">${dateStr}</div><div class="day-name">${dayName}</div></div><div class="race-count">${racesByDate[date].length} races</div>`;
        grid.appendChild(card);
    });
    
    document.getElementById('dateSelector').classList.remove('hidden');
}

function selectDate(date) {
    selectedDate = date;
    document.getElementById('dateSelector').classList.add('hidden');
    showTrackSelector();
    updateUrl('track', selectedDate); // Update URL for track selector view
}

function showTrackSelector() {
    document.getElementById('headerTitle').textContent = '🏇 Select a Track';
    const racesForDate = races.filter(r => r.date === selectedDate);
    const racesByTrack = {};
    racesForDate.forEach(race => {
        if (!racesByTrack[race.track]) racesByTrack[race.track] = [];
        racesByTrack[race.track].push(race);
    });
    
    const dateObj = new Date(selectedDate + 'T00:00:00');
    document.getElementById('selectedDateTitle').textContent = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
    const grid = document.getElementById('trackGrid');
    grid.innerHTML = '';
    Object.keys(racesByTrack).sort().forEach(track => {
        const card = document.createElement('div');
        card.className = 'track-card';
        if (hasPicksForTrack(track)) card.classList.add('has-picks');
        card.onclick = () => selectTrack(track);
        card.innerHTML = `<div class="track-name">${track}</div><div class="race-count">${racesByTrack[track].length} races</div>`;
        grid.appendChild(card);
    });
    
    document.getElementById('trackSelector').classList.remove('hidden');
}

function selectTrack(track) {
    selectedTrack = track;
    document.getElementById('trackSelector').classList.add('hidden');
    showRaceSelector();
    updateUrl('race', selectedDate, selectedTrack); // Update URL for race selector view
}

function showRaceSelector() {
    document.getElementById('headerTitle').textContent = '🏇 Select a Race';
    const racesForTrack = races.filter(r => r.date === selectedDate && r.track === selectedTrack);
    racesForTrack.sort((a, b) => {
        const aNum = a.raceNumber || a.id;
        const bNum = b.raceNumber || b.id;
        return aNum - bNum;
    });
    
    document.getElementById('selectedTrackTitle').textContent = `${selectedTrack} - ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    
    const list = document.getElementById('raceList');
    list.innerHTML = '';
    racesForTrack.forEach((race) => {
        const card = document.createElement('div');
        card.className = 'race-card';
        if (hasPicksForRace(race.id)) card.classList.add('has-picks');
        card.onclick = () => selectRace(race);
        const gradeBadge = race.grade ? `<span class="grade-badge">${race.grade}</span>` : '';
        const raceNum = race.raceNumber || race.id;
        card.innerHTML = `<div class="race-number">R${raceNum}</div><div class="race-info"><div class="race-title">${race.title} ${gradeBadge}</div><div class="race-details">${race.distance} ${race.surface} - ${race.horses.length} horses</div></div>`;
        list.appendChild(card);
    });
    
    document.getElementById('raceSelector').classList.remove('hidden');
}

function selectRace(race) {
    document.getElementById('headerTitle').textContent = '🏇 Pick Your Horses';
    selectedRace = race;
    myPicks.clear();
    document.getElementById('raceSelector').classList.add('hidden');
    const gradeBadge = race.grade ? `<span class="grade-badge">${race.grade}</span>` : '';
    document.getElementById('selectedRaceTitle').innerHTML = `${race.title} ${gradeBadge}`;
    document.getElementById('selectedRaceInfo').textContent = `${race.track} - ${race.distance} ${race.surface}`;
    loadHorses(race);
    document.getElementById('raceDetail').classList.remove('hidden');
    startPoll();
    updateUrl('detail', selectedDate, selectedTrack, selectedRace.id); // Update URL for race detail view
}

function startPoll() {
    stopPoll();
    poll = setInterval(() => {
        if (selectedRace) loadExistingPicks();
    }, 3000);
}

function stopPoll() {
    if (poll) {
        clearInterval(poll);
        poll = null;
    }
}

function loadHorses(race) {
    const list = document.getElementById('horseList');
    list.innerHTML = '';
    const horses = [...race.horses].sort((a, b) => a.number - b.number);
    
    horses.forEach(horse => {
        const card = document.createElement('div');
        card.className = 'horse-card';
        card.onclick = () => togglePick(horse.number, card);
        card.innerHTML = `<div class="horse-number">#${horse.number}</div><div class="horse-name">${horse.name}</div>`;
        card.dataset.horseNumber = horse.number;
        list.appendChild(card);
    });
    
    loadExistingPicks();
    updateButtons(); // Ensure buttons are updated after loading horses and picks
}

function togglePick(number, card) {
    if (myPicks.has(number)) {
        myPicks.delete(number);
        card.classList.remove('selected');
        card.style.background = ''; // Reset background
    } else {
        myPicks.add(number);
        card.classList.add('selected');
        card.style.background = `${currentUserColor}15`; // Apply light accent background
    }
    updateButtons();
}

function updateButtons() {
    const confirmBtn = document.getElementById('confirmPickBtn');
    // const watchBtn = document.getElementById('watchBtn'); // Watch button is not in the provided HTML
    confirmBtn.disabled = myPicks.size === 0;
    // const confirmed = localStorage.getItem(`${currentSession}_${selectedRace.id}_confirmed`) === 'true';
    // if (watchBtn) watchBtn.disabled = !confirmed;
}

async function confirmPicks() {
    if (myPicks.size === 0) return;
    
    const pickData = {
        user: currentUser,
        raceId: selectedRace.id,
        horses: Array.from(myPicks),
        color: currentUserColor,
        timestamp: new Date().toISOString()
    };
    
    try {
        const response = await fetch(`${API_URL}/picks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_code: currentSession,
                race_id: selectedRace.id,
                user_name: currentUser,
                horse_numbers: Array.from(myPicks),
                user_color: currentUserColor // Send user color with pick
            })
        });
        if (response.ok) console.log('✅ Saved to API');
    } catch (e) {
        console.error('Save error:', e);
    }
    
    localStorage.setItem(`${currentSession}_${selectedRace.id}_${currentUser}`, JSON.stringify(pickData));
    localStorage.setItem(`${currentSession}_${selectedRace.id}_confirmed`, 'true');
    
    const horseNames = Array.from(myPicks).map(num => {
        const horse = selectedRace.horses.find(h => h.number === num);
        return `#${num} ${horse.name}`;
    }).join(', ');
    
    alert(`✅ Picks confirmed!\n\nYou chose: ${horseNames}`);
    await loadAllSessionPicks(); // Reload all picks to update badges
    loadExistingPicks();
    updateButtons();
}

async function loadExistingPicks() {
    const picks = {};
    const userColors = {};
    
    // Fetch from API
    try {
        const response = await fetch(`${API_URL}/picks?session=${currentSession}&race=${selectedRace.id}`);
        if (response.ok) {
            const data = await response.json();
            data.forEach(p => {
                picks[p.user_name] = JSON.parse(p.horse_numbers);
                if (p.user_color) userColors[p.user_name] = p.user_color;
            });
        }
    } catch (e) {
        console.error('Error fetching existing picks from API:', e);
    }
    
    // Also check local storage for current user's unconfirmed picks or other session data
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${currentSession}_${selectedRace.id}_`) && !key.endsWith('_confirmed')) {
            const username = key.split('_').pop();
            if (!picks[username]) { // Only add if not already fetched from API
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    picks[username] = data.horses;
                    if (data.color) userColors[username] = data.color;
                } catch (e) { /* ignore malformed JSON */ }
            }
        }
    }
    
    userColors[currentUser] = currentUserColor; // Ensure current user's color is always correct
    
    // Clear existing badges and styles
    document.querySelectorAll('.picker-badge').forEach(badge => badge.remove());
    document.querySelectorAll('.horse-card').forEach(card => {
        card.classList.remove('picked-by-user2', 'gradient-border', 'selected');
        card.style.background = '';
        card.style.backgroundImage = '';
        card.style.backgroundOrigin = '';
        card.style.backgroundClip = '';
        card.style.border = '1px solid var(--border)'; // Reset to default border
        card.style.setProperty('--gradient-border', 'none');
    });
    
    // Re-apply current user's selections
    myPicks.forEach(num => {
        const card = document.querySelector(`[data-horse-number="${num}"]`);
        if (card) {
            card.classList.add('selected');
            card.style.background = `${currentUserColor}15`;
            card.style.border = `1px solid ${currentUserColor}`;
        }
    });

    // Track horses picked by multiple users
    const horsePickCounts = {};
    Object.entries(picks).forEach(([user, horseNumbers]) => {
        horseNumbers.forEach(num => {
            if (!horsePickCounts[num]) horsePickCounts[num] = [];
            horsePickCounts[num].push({ user: user, color: userColors[user] || '#ff9800' });
        });
    });
    
    // Add badges and apply gradients/borders
    Object.keys(horsePickCounts).forEach(num => {
        const card = document.querySelector(`[data-horse-number="${num}"]`);
        if (!card) return;

        const pickerData = horsePickCounts[num];
        
        // Add badges
        pickerData.forEach(data => {
            const badge = document.createElement('div');
            badge.className = 'picker-badge';
            badge.style.background = data.color;
            badge.textContent = data.user.charAt(0).toUpperCase();
            badge.title = data.user;
            card.appendChild(badge);
            if (data.user !== currentUser) card.classList.add('picked-by-user2');
        });

        // Apply gradients/borders for multiple picks or single other user's pick
        if (pickerData.length > 1) {
            const borderGradientStops = pickerData.map((data, i) => {
                const pct = (i / (pickerData.length - 1)) * 100;
                return `${data.color} ${pct}%`;
            }).join(', ');
            
            card.style.position = 'relative';
            card.style.border = 'none'; // Remove solid border
            card.style.setProperty('--gradient-border', `linear-gradient(90deg, ${borderGradientStops})`);
            card.classList.add('gradient-border');
            
            // For background, blend colors or use a light version of one
            const bgGradientStops = pickerData.map((data, i) => {
                const lightColor = lightenColor(data.color, 0.8); // Lighter version for background
                const pct = (i / (pickerData.length - 1)) * 100;
                return `${lightColor} ${pct}%`;
            }).join(', ');
            card.style.background = `linear-gradient(90deg, ${bgGradientStops})`;

        } else if (pickerData.length === 1 && pickerData[0].user !== currentUser) {
            // Single other user's pick
            const pickerColor = pickerData[0].color;
            card.style.background = `${pickerColor}15`;
            card.style.border = `1px solid ${pickerColor}`;
            card.classList.remove('gradient-border');
        }
    });
}

function watchRace() {
    if (selectedRace && selectedRace.videoUrl) {
        window.open(selectedRace.videoUrl, '_blank');
    } else {
        alert('No video URL available for this race.');
    }
}

function backToHome() {
    stopPoll();
    document.getElementById('trackSelector').classList.add('hidden');
    document.getElementById('raceSelector').classList.add('hidden');
    document.getElementById('raceDetail').classList.add('hidden');
    showDateSelector();
    updateUrl('date'); // Go back to date selector view
}

function backToDateSelector() {
    stopPoll();
    document.getElementById('trackSelector').classList.add('hidden');
    document.getElementById('raceSelector').classList.add('hidden');
    document.getElementById('raceDetail').classList.add('hidden');
    showDateSelector();
    updateUrl('date');
}

function backToTrackSelector() {
    stopPoll();
    document.getElementById('raceSelector').classList.add('hidden');
    document.getElementById('raceDetail').classList.add('hidden');
    showTrackSelector();
    updateUrl('track', selectedDate);
}

function backToRaceSelector() {
    stopPoll();
    document.getElementById('raceDetail').classList.add('hidden');
    showRaceSelector();
    updateUrl('race', selectedDate, selectedTrack);
}

// URL Management functions
function updateUrl(view, date = '', track = '', raceId = '') {
    const url = new URL(window.location.origin + window.location.pathname);
    if (date) url.searchParams.set('date', date);
    if (track) url.searchParams.set('track', track);
    if (raceId) url.searchParams.set('raceId', raceId);
    url.searchParams.set('view', view);
    history.pushState({ view: view, date: date, track: track, raceId: raceId }, '', url.toString());
}

async function renderViewFromUrl() {
    // Hide all sections initially
    document.getElementById('setup').classList.add('hidden');
    document.getElementById('dateSelector').classList.add('hidden');
    document.getElementById('trackSelector').classList.add('hidden');
    document.getElementById('raceSelector').classList.add('hidden');
    document.getElementById('raceDetail').classList.add('hidden');
    document.getElementById('backToHomeBtn').classList.add('hidden');

    const params = new URLSearchParams(window.location.search);
    const urlDate = params.get('date');
    const urlTrack = params.get('track');
    const urlRaceId = params.get('raceId');
    const urlView = params.get('view');

    // If no user/session, always show setup
    if (!currentUser || !currentSession) {
        document.getElementById('setup').classList.remove('hidden');
        return;
    }

    document.getElementById('headerTitle').textContent = '🏇 Horsie Picker'; // Default header

    // Load races if not already loaded and needed for deep linking
    if (races.length === 0 && (urlDate || urlTrack || urlRaceId)) {
        await loadRaces();
    }
    // Load all session picks if session is active and needed for deep linking
    if (currentSession && (urlDate || urlTrack || urlRaceId)) {
        await loadAllSessionPicks();
    }

    if (urlRaceId && urlDate && urlTrack) {
        selectedDate = urlDate;
        selectedTrack = urlTrack;
        selectedRace = races.find(e => e.id == urlRaceId && e.date === selectedDate && e.track === selectedTrack);
        if (selectedRace) {
            selectRace(selectedRace);
        } else {
            console.warn('Race not found for URL, falling back to race selector.');
            showRaceSelector();
        }
    } else if (urlTrack && urlDate) {
        selectedDate = urlDate;
        selectedTrack = urlTrack;
        showTrackSelector();
    } else if (urlDate) {
        selectedDate = urlDate;
        showDateSelector();
    } else {
        showDateSelector(); // Default view if no specific params
    }
}

// Expose functions to global scope for HTML onclick attributes
window.selectColor = selectColor;
window.joinSession = joinSession;
window.refreshSessions = refreshSessions;
window.joinExistingSession = joinExistingSession;
window.deleteSession = deleteSession;
window.clearAllSessions = clearAllSessions;
window.refreshRaces = refreshRaces;
window.selectDate = selectDate;
window.selectTrack = selectTrack;
window.selectRace = selectRace;
window.togglePick = togglePick;
window.confirmPicks = confirmPicks;
window.watchRace = watchRace;
window.backToHome = backToHome;
window.backToDateSelector = backToDateSelector;
window.backToTrackSelector = backToTrackSelector;
window.backToRaceSelector = backToRaceSelector;

// Handle browser history navigation
window.addEventListener('popstate', (event) => {
    if (event.state) {
        currentUser = localStorage.getItem('username') || ''; // Re-load user/session from local storage
        currentSession = localStorage.getItem('sessionCode') || '';
        renderViewFromUrl();
    } else {
        // If popstate event has no state, it's likely the initial page load or navigating to root
        // We can re-render based on current URL or default to home
        renderViewFromUrl();
    }
});
