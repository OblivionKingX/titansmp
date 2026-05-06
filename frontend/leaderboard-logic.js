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
    if (stat === 'money' || stat === 'islands') {
        return `$${value.toLocaleString()}`;
    }
    return value.toLocaleString();
}

let unsubscribeCurrentStat = null;

window.loadStat = function(stat) {
    console.log('[Debug] loadStat called for:', stat);
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
        console.log(`[Debug] Data received for ${stat}:`, data ? Object.keys(data).length + ' entries' : 'Empty');
        
        if (data) {
            currentPlayersData = Object.entries(data)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => {
                    // Custom sort for objects (islands) vs numbers (players)
                    const valA = typeof a.value === 'object' ? a.value.worth : a.value;
                    const valB = typeof b.value === 'object' ? b.value.worth : b.value;
                    return valB - valA;
                });
        } else {
            currentPlayersData = [];
        }
        renderLeaderboard();
    }, (error) => {
        console.error(`[Debug] Firebase Error for ${stat}:`, error);
    });
}

let allPlayerData = {};

// Subscribe to player metadata (ranks, etc.)
onValue(ref(db, 'playerData'), (snapshot) => {
    console.log('[Debug] PlayerData updated');
    allPlayerData = snapshot.val() || {};
    renderLeaderboard();
});

function renderLeaderboard() {
    console.log('[Debug] Rendering leaderboard with', currentPlayersData.length, 'players');
    try {
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const filteredPlayers = currentPlayersData.filter(p => {
            if (!p || !p.name) return false;
            // For islands, check islandName and leaderName
            if (typeof p.value === 'object') {
                return p.value.islandName.toLowerCase().includes(searchTerm) || 
                       p.value.leaderName.toLowerCase().includes(searchTerm);
            }
            return p.name.toLowerCase().includes(searchTerm);
        });

        leaderboardBody.innerHTML = '';
        
        if (filteredPlayers.length === 0) {
            leaderboardBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No players found.</td></tr>';
        } else {
            filteredPlayers.forEach((player) => {
                try {
                    const originalRank = currentPlayersData.findIndex(p => p.name === player.name) + 1;
                    const rankClass = originalRank <= 3 ? `rank-${originalRank}` : '';
                    
                    let displayName = player.name;
                    let displayValue = player.value;
                    let headName = player.name;
                    let metadata = allPlayerData[player.name] || {};

                    // IF IT'S AN ISLAND (OBJECT)
                    if (typeof player.value === 'object') {
                        displayName = `<div style="font-size: 0.9em; color: var(--accent-color);">Island: ${player.value.islandName}</div>
                                       <div style="font-size: 0.8em; opacity: 0.8;">Leader: ${player.value.leaderName}</div>`;
                        displayValue = player.value.worth;
                        headName = player.value.leaderName;
                        metadata = allPlayerData[player.value.leaderName] || {};
                    }

                    // Format rank if available (normalize § to & for utils.js)
                    let rankHtml = '';
                    if (metadata.rank) {
                        let rankText = metadata.rank.replace(/§/g, '&');
                        
                        // Escape special characters in the name for the regex
                        const escapedName = headName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const nameRegex = new RegExp(`\\s*${escapedName}\\s*`, 'gi');
                        rankText = rankText.replace(nameRegex, '').trim();

                        if (rankText.length > 0) {
                            const formattedRank = window.formatRichText ? window.formatRichText(rankText) : rankText;
                            rankHtml = `<span class="player-rank-badge">${formattedRank}</span>`;
                        }
                    }
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="rank ${rankClass}">#${originalRank}</td>
                        <td>
                            <div class="player-cell">
                                <img class="player-head" src="https://mc-heads.net/avatar/${headName}/32" alt="${headName}">
                                <div class="player-info">
                                    ${rankHtml}
                                    <span class="player-name">${displayName}</span>
                                </div>
                            </div>
                        </td>
                        <td class="score-cell">${formatValue(displayValue, currentStat)}</td>
                    `;
                    leaderboardBody.appendChild(row);
                } catch (innerError) {
                    console.error('Error rendering row for:', player, innerError);
                }
            });
        }
    } catch (outerError) {
        console.error('Critical error in renderLeaderboard:', outerError);
        leaderboardBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--accent-color);">Failed to load rankings. Please refresh.</td></tr>';
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (leaderboardTable) leaderboardTable.style.display = 'table';
    }
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
