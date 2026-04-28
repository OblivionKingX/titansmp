import { db, ref, onValue } from './firebase-global.js';

const leaderboardBody = document.getElementById('leaderboard-body');
const leaderboardTable = document.getElementById('leaderboard-table');
const loadingIndicator = document.getElementById('loading-indicator');
const tabButtons = document.querySelectorAll('.tab-btn');
const searchInput = document.getElementById('playerSearch');

let currentStat = 'money';
let currentPlayersData = [];

// Function to load the navbar from template
async function loadNavbar() {
    try {
        const response = await fetch('navbar-template.html');
        const html = await response.text();
        document.getElementById('navbar-placeholder').innerHTML = html;
        
        // After loading navbar, we might need to trigger navbar-logic.js
        const script = document.createElement('script');
        script.type = 'module';
        script.src = 'navbar-logic.js';
        document.body.appendChild(script);
    } catch (err) {
        console.error('Failed to load navbar:', err);
    }
}

function updateTabUI(stat) {
    tabButtons.forEach(btn => {
        if (btn.innerText.toLowerCase().includes(stat.toLowerCase())) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function formatValue(value, stat) {
    if (stat === 'playtime') {
        // Playtime is fetched directly via PAPI in seconds
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
    if (stat === 'money') {
        return `$${value.toLocaleString()}`;
    }
    return value.toLocaleString();
}

let unsubscribeCurrentStat = null;

window.loadStat = function(stat) {
    currentStat = stat;
    updateTabUI(stat);
    
    loadingIndicator.style.display = 'block';
    if(leaderboardTable) leaderboardTable.style.display = 'none';
    
    // Unsubscribe from previous stat listener to prevent data bleeding
    if (unsubscribeCurrentStat) {
        unsubscribeCurrentStat();
    }
    
    const leaderboardRef = ref(db, `leaderboard/${stat}`);
    
    unsubscribeCurrentStat = onValue(leaderboardRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            currentPlayersData = Object.entries(data)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value);
        } else {
            currentPlayersData = [];
        }
        renderLeaderboard();
    });
}

function renderLeaderboard() {
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const filteredPlayers = currentPlayersData.filter(p => p.name.toLowerCase().includes(searchTerm));

    leaderboardBody.innerHTML = '';
    
    if (filteredPlayers.length === 0) {
        leaderboardBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No players found.</td></tr>';
    } else {
        filteredPlayers.forEach((player) => {
            const originalRank = currentPlayersData.findIndex(p => p.name === player.name) + 1;
            const rankClass = originalRank <= 3 ? `rank-${originalRank}` : '';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="rank ${rankClass}">#${originalRank}</td>
                <td>
                    <div class="player-cell">
                        <img class="player-head" src="https://mc-heads.net/avatar/${player.name}/32" alt="${player.name}">
                        <span>${player.name}</span>
                    </div>
                </td>
                <td class="score-cell">${formatValue(player.value, currentStat)}</td>
            `;
            leaderboardBody.appendChild(row);
        });
    }
    
    loadingIndicator.style.display = 'none';
    if(leaderboardTable) leaderboardTable.style.display = 'table';
}

if (searchInput) {
    searchInput.addEventListener('input', () => {
        renderLeaderboard();
    });
}

// Initialize
loadNavbar();
window.loadStat('money');

// ====================================
// SHARED UI LOGIC (from index-logic.js)
// ====================================

async function updateServerStatus() {
    const playerCount = document.getElementById('player-count');
    if (!playerCount) return;

    try {
        const response = await fetch('https://api.mcsrvstat.us/2/titannetwork.eu');
        const data = await response.json();

        if (data.online) {
            const count = data.players?.online || 0;
            playerCount.textContent = `${count} Player${count !== 1 ? 's' : ''} Online`;
        } else {
            playerCount.textContent = 'Server Offline';
        }
    } catch (error) {
        console.error('Error fetching server status:', error);
    }
}

window.copyIP = function() {
    navigator.clipboard.writeText('titannetwork.eu').then(() => {
        alert('IP copied to clipboard!');
    });
};

window.joinServer = function() {
    alert('To join TitanNetwork:\n1. Open Minecraft\n2. Click "Multiplayer"\n3. Click "Add Server"\n4. Enter: titannetwork.eu\n5. Click "Done" and join!');
    window.copyIP();
};

document.addEventListener('DOMContentLoaded', async () => {
    updateServerStatus();
    setInterval(updateServerStatus, 30000);
});
