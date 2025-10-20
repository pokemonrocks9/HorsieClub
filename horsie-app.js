// Global variables
let currentUser = '';
let currentSession = '';
let currentUserColor = '#f44336';
let selectedDate = '';
let selectedTrack = '';
let selectedRace = null;
let myPicks = new Set();
let races = [];

const API_URL = 'https://horsie.tytygoins.workers.dev';
const GITHUB_RACES_URL = 'https://raw.githubusercontent.com/pokemonrocks9/HorsieClub/main/races.json';

function selectColor(color) {
    currentUserColor = color;
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('selected');
        if (opt.dataset.color === color) opt.classList.add('selected');
    });
    localStorage.setItem('userColor', color);
}

window.addEventListener('DOMContentLoaded', async () => {
    const savedColor = localStorage.getItem('userColor');
    if (savedColor) selectColor(savedColor);
    await autoCleanupOldSessions();
    refreshSessions();
    document.getElementById('sessionCode').addEventListener('input', updateSessionButton);
});

async function autoCleanupOldSessions() {
    try {
        await fetch(`${API_URL}/picks/old`, { method: 'DELETE' });
        console.log('✅ Auto-cleaned old sessions');
    } catch (e) {
        console.error('Auto-cleanup error:', e);
    }
    
    const keysToDelete = [];
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
    
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
            } catch (e) {}
        }
    }
    
    keysToDelete.forEach(key => localStorage.removeItem(key));
    if (keysToDelete.length > 0) console.log(`✅ Auto-cleaned ${keysToDelete.length} old localStorage entries`);
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
    showDateSelector();
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
}

function showTrackSelector() {
    const racesForDate = races.filter(r => r.date === selectedDate);
    const racesByTrack = {};
    racesForDate.forEach(race => {
        if (!racesByTrack[race.track]) racesByTrack[race.track] = [];
        racesByTrack[race.track].push(race);
    });
    
    const dateObj = new Date(selectedDate);
    document.getElementById('selectedDateTitle').textContent = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
    const grid = document.getElementById('trackGrid');
    grid.innerHTML = '';
    Object.keys(racesByTrack).sort().forEach(track => {
        const card = document.createElement('div');
        card.className = 'track-card';
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
}

function showRaceSelector() {
    const racesForTrack = races.filter(r => r.date === selectedDate && r.track === selectedTrack);
    racesForTrack.sort((a, b) => {
        const aNum = a.raceNumber || a.id;
        const bNum = b.raceNumber || b.id;
        return aNum - bNum;
    });
    
    document.getElementById('selectedTrackTitle').textContent = `${selectedTrack} - ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    
    const list = document.getElementById('raceList');
    list.innerHTML = '';
    racesForTrack.forEach((race) => {
        const card = document.createElement('div');
        card.className = 'race-card';
        card.onclick = () => selectRace(race);
        const gradeBadge = race.grade ? `<span class="grade-badge">${race.grade}</span>` : '';
        const raceNum = race.raceNumber || race.id;
        card.innerHTML = `<div class="race-number">R${raceNum}</div><div class="race-info"><div class="race-title">${race.title} ${gradeBadge}</div><div class="race-details">${race.distance} ${race.surface} - ${race.horses.length} horses</div></div>`;
        list.appendChild(card);
    });
    
    document.getElementById('raceSelector').classList.remove('hidden');
}

function selectRace(race) {
    selectedRace = race;
    myPicks.clear();
    document.getElementById('raceSelector').classList.add('hidden');
    const gradeBadge = race.grade ? `<span class="grade-badge">${race.grade}</span>` : '';
    document.getElementById('selectedRaceTitle').innerHTML = `${race.title} ${gradeBadge}`;
    document.getElementById('selectedRaceInfo').textContent = `${race.track} - ${race.distance} ${race.surface}`;
    loadHorses(race);
    document.getElementById('raceDetail').classList.remove('hidden');
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
}

function togglePick(number, card) {
    if (myPicks.has(number)) {
        myPicks.delete(number);
        card.classList.remove('selected');
    } else {
        myPicks.add(number);
        card.classList.add('selected');
    }
    updateButtons();
}

function updateButtons() {
    const confirmBtn = document.getElementById('confirmPickBtn');
    const watchBtn = document.getElementById('watchBtn');
    confirmBtn.disabled = myPicks.size === 0;
    const confirmed = localStorage.getItem(`${currentSession}_${selectedRace.id}_confirmed`) === 'true';
    watchBtn.disabled = !confirmed;
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
                horse_numbers: Array.from(myPicks)
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
    loadExistingPicks();
    updateButtons();
}

async function loadExistingPicks() {
    const allPicks = {};
    const userColors = {};
    
    try {
        const response = await fetch(`${API_URL}/picks?session=${currentSession}&race=${selectedRace.id}`);
        if (response.ok) {
            const data = await response.json();
            data.forEach(pick => {
                const horses = JSON.parse(pick.horse_numbers);
                allPicks[pick.user_name] = horses;
            });
        }
    } catch (e) {
        console.error('Load picks error:', e);
    }
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${currentSession}_${selectedRace.id}_`) && !key.endsWith('_confirmed')) {
            const username = key.split('_').pop();
            if (!allPicks[username]) {
                const data = JSON.parse(localStorage.getItem(key));
                allPicks[username] = data.horses;
                if (data.color) userColors[username] = data.color;
            }
        }
    }
    
    userColors[currentUser] = currentUserColor;
    
    document.querySelectorAll('.picker-badge').forEach(badge => badge.remove());
    document.querySelectorAll('.picked-by-user2').forEach(card => card.classList.remove('picked-by-user2'));
    
    Object.entries(allPicks).forEach(([username, horses]) => {
        const userColor = userColors[username] || (username === currentUser ? currentUserColor : '#ff9800');
        const initial = username.charAt(0).toUpperCase();
        
        horses.forEach(horseNum => {
            const card = document.querySelector(`[data-horse-number="${horseNum}"]`);
            if (card) {
                const badge = document.createElement('div');
                badge.className = 'picker-badge';
                badge.style.background = userColor;
                badge.textContent = initial;
                badge.title = username;
                card.appendChild(badge);
                if (username !== currentUser) card.classList.add('picked-by-user2');
            }
        });
    });
}

function watchRace() {
    window.open(selectedRace.videoUrl, '_blank');
}

function backToDateSelector() {
    document.getElementById('trackSelector').classList.add('hidden');
    document.getElementById('raceSelector').classList.add('hidden');
    document.getElementById('raceDetail').classList.add('hidden');
    showDateSelector();
}

function backToTrackSelector() {
    document.getElementById('raceSelector').classList.add('hidden');
    document.getElementById('raceDetail').classList.add('hidden');
    showTrackSelector();
}

function backToRaceSelector() {
    document.getElementById('raceDetail').classList.add('hidden');
    showRaceSelector();
}
