// Navigation
function toggleMenu() {
    const navLinks = document.getElementById('nav-links');
    navLinks.classList.toggle('active');
}

function toggleMoreMenu() {
    const moreMenu = document.getElementById('more-menu');
    const dropdown = document.querySelector('.more-dropdown');
    dropdown.classList.toggle('active');
}

// Close menus when clicking outside
document.addEventListener('click', function(event) {
    const navLinks = document.getElementById('nav-links');
    const moreDropdown = document.querySelector('.more-dropdown');
    const moreMenu = document.getElementById('more-menu');
    const menuToggle = document.querySelector('.menu-toggle');
    const moreBtn = document.querySelector('.more-btn');
    
    // Close mobile menu
    if (!event.target.closest('.nav-links') && !event.target.closest('.menu-toggle') && navLinks.classList.contains('active')) {
        navLinks.classList.remove('active');
    }
    
    // Close more menu
    if (!event.target.closest('.more-dropdown') && moreDropdown.classList.contains('active')) {
        moreDropdown.classList.remove('active');
    }
});

// Copy IP
function copyIP() {
    const ip = document.getElementById('server-ip').textContent;
    navigator.clipboard.writeText(ip).then(() => {
        alert('IP copied to clipboard: ' + ip);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Server status simulation (replace with real API)
function updateServerStatus() {
    const statusElement = document.getElementById('server-status');
    const playerCountElement = document.getElementById('player-count-text');
    const onlineCountElement = document.getElementById('online-count');
    const maxCountElement = document.getElementById('max-count');
    const statusIndicator = document.querySelector('.status-indicator');
    
    // Simulating online status
    const isOnline = Math.random() > 0.1; // 90% chance online
    
    if (isOnline) {
        const onlinePlayers = Math.floor(Math.random() * 100) + 50;
        const maxPlayers = 200;
        
        statusElement.innerHTML = '<i class="fas fa-circle status-indicator"></i> Online';
        statusIndicator.style.color = '#3FAD45';
        playerCountElement.textContent = `${onlinePlayers} / ${maxPlayers}`;
        onlineCountElement.textContent = onlinePlayers;
        maxCountElement.textContent = maxPlayers;
    } else {
        statusElement.innerHTML = '<i class="fas fa-circle status-indicator"></i> Offline';
        statusIndicator.style.color = '#ff5268';
        playerCountElement.textContent = '0 / 200';
        onlineCountElement.textContent = '0';
        maxCountElement.textContent = '200';
    }
}

// Player list
let playerListVisible = false;

function togglePlayerList() {
    const popup = document.getElementById('player-list-popup');
    const playerList = document.getElementById('player-list');
    
    playerListVisible = !playerListVisible;
    
    if (playerListVisible) {
        popup.style.display = 'flex';
        // Simulate player list
        const players = ['Player1', 'Steve', 'Alex', 'Notch', 'HeroBr', 'Miner', 'Builder', 'PVPer', 'Farmer', 'Explorer'];
        playerList.innerHTML = players.map(player => `<li>${player}</li>`).join('');
    } else {
        popup.style.display = 'none';
    }
}

// FAQ
function toggleAnswer(element) {
    const answerCont = element.nextElementSibling;
    element.classList.toggle('active');
    
    if (answerCont.style.maxHeight) {
        answerCont.style.maxHeight = null;
    } else {
        answerCont.style.maxHeight = answerCont.scrollHeight + "px";
    }
}

// Join server function
function joinServer() {
    const ip = document.getElementById('server-ip').textContent;
    alert(`To join the server:\n1. Open Minecraft\n2. Click "Multiplayer"\n3. Click "Add Server"\n4. Enter: ${ip}\n5. Click "Done" and join!`);
}

// Join Discord function
function joinDiscord() {
    // Replace with your Discord invite link
    window.open('https://discord.gg/', '_blank');
}

// Discord member count simulation
function updateDiscordCount() {
    const discordCount = document.querySelector('.ndzn-js--discordcount');
    const count = Math.floor(Math.random() * 500) + 1000;
    discordCount.textContent = count.toLocaleString();
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', function() {
    updateServerStatus();
    updateDiscordCount();
    
    // Update server status every 30 seconds
    setInterval(updateServerStatus, 30000);
    
    // Update Discord count every 60 seconds
    setInterval(updateDiscordCount, 60000);
    
    // Add active class to current page in nav
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPage) {
            link.classList.add('active');
        }
    });
});

// Close popup when clicking outside
window.onclick = function(event) {
    const popup = document.getElementById('player-list-popup');
    if (event.target === popup) {
        togglePlayerList();
    }
}