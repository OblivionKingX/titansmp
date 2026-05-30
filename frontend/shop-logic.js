import './firebase-global.js';
import { initNavbar, updateUIForUser } from './navbar-logic.js';
const { auth, onAuthStateChanged, db, ref, get, onValue } = window.firebaseApp;


// Shop Items Configuration with Gold Prices
const SHOP_ITEMS = [
  {
    id: 'starter_kit',
    name: 'Starter Kit',
    category: 'items',
    icon: 'fa-shopping-basket',
    description: 'Get a jumpstart with basic armor, tools, and some food.',
    price: 50,
    badge: 'NEW',
    command: 'kit starter {player}'
  },
  {
    id: 'vip_trial',
    name: 'VIP Trial (1 Day)',
    category: 'ranks',
    icon: 'fa-gem',
    description: 'Experience VIP perks for 24 hours including /fly and /heal.',
    price: 500,
    badge: 'LIMITED',
    command: 'lp user {player} parent addtemp vip 1d'
  },
  {
    id: 'elite_rank',
    name: 'Elite Rank (7 Days)',
    category: 'ranks',
    icon: 'fa-crown',
    description: 'A powerful week-long rank with exclusive access to /feed and /workbench.',
    price: 2500,
    badge: 'POPULAR',
    command: 'lp user {player} parent addtemp elite 7d'
  },
  {
    id: 'vote_crate_key',
    name: 'Vote Crate Key',
    category: 'items',
    icon: 'fa-key',
    description: 'A key to open the Vote Crate at spawn. Contains random rewards!',
    price: 25,
    command: 'crate give physical Vote {player} 1'
  },
  {
    id: 'titan_sword',
    name: 'The Titan Sword',
    category: 'items',
    icon: 'fa-sword',
    description: 'A legendary Sharpness V diamond sword to dominate your enemies.',
    price: 1500,
    command: 'give {player} diamond_sword{Enchantments:[{id:sharpness,lvl:5}]} 1'
  },
  {
    id: 'god_apples',
    name: 'God Apples (x16)',
    category: 'items',
    icon: 'fa-apple-alt',
    description: '16 Enchanted Golden Apples to keep you alive in the toughest battles.',
    price: 300,
    command: 'give {player} enchanted_golden_apple 16'
  },
  {
    id: 'money_boost_large',
    name: '$25,000 In-Game',
    category: 'currency',
    icon: 'fa-coins',
    description: 'A massive injection of cash to help you build your empire.',
    price: 4000,
    badge: 'BEST VALUE',
    command: 'eco give {player} 25000'
  },
  {
    id: 'money_boost',
    name: '$5,000 In-Game',
    category: 'currency',
    icon: 'fa-money-bill-wave',
    description: 'Boost your balance with a one-time gift of $5,000.',
    price: 1000,
    command: 'eco give {player} 5000'
  },
  {
    id: 'points_crate_key',
    name: 'Points Crate Key',
    category: 'items',
    icon: 'fa-star',
    description: 'A key to open the Points Crate, purchased exclusively with Activity Points!',
    price: 50,
    currencyType: 'points',
    badge: 'POINTS',
    command: 'crate give physical Points {player} 1'
  }
];

let currentFilter = 'all';
let currentItem = null;
let userGold = 0;
let userPoints = 0;

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  renderItems();
  
  // Initialize server status
  updateServerStatus();
  setInterval(updateServerStatus, 30000);

  // Mobile menu toggle
  window.toggleMobileMenu = function () {
    const navLinks = document.getElementById('nav-links');
    if (navLinks) navLinks.classList.toggle('active');
  };

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('user-dropdown');
    const userMenu = document.querySelector('.user-menu');
    if (dropdown && userMenu && !userMenu.contains(e.target)) {
      dropdown.classList.remove('active');
    }
    const moreMenu = document.getElementById('moreMenu');
    const moreBtn = document.querySelector('.more-btn');
    if (moreMenu && moreBtn && !moreBtn.contains(e.target)) {
      moreMenu.style.display = '';
    }
  });
  
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userSnap = await get(ref(db, `users/${user.uid}`));
        if (userSnap.exists()) {
          const data = userSnap.val();
          const ign = data.username || data.displayName;
          if (ign) {
            document.getElementById('mc-username').value = ign;
            syncGoldBalance(ign);
          }
        }
      } catch (err) {
        console.warn("Could not fetch user IGN for shop:", err);
      }
    }
  });
});

function syncGoldBalance(ign) {
  const goldRef = ref(db, `playerData/${ign}/gold`);
  onValue(goldRef, (snapshot) => {
    userGold = snapshot.val() || 0;
    const el = document.getElementById('user-gold-balance');
    const container = document.getElementById('gold-balance-container');
    if (el) el.innerText = userGold.toLocaleString();
    if (container) container.style.display = 'flex';
  });

  // Also sync points balance
  const pointsRef = ref(db, `playerData/${ign}/points`);
  onValue(pointsRef, (snapshot) => {
    userPoints = snapshot.val() || 0;
    const el = document.getElementById('user-points-balance');
    const wrapper = document.getElementById('points-balance-wrapper');
    if (el) el.innerText = userPoints.toLocaleString();
    if (wrapper) wrapper.style.display = 'block';
  });
}

window.filterItems = (category) => {
  currentFilter = category;
  document.querySelectorAll('.shop-tab').forEach(tab => {
    const text = tab.innerText.toLowerCase();
    if (category === 'all' ? text.includes('all') : text.includes(category)) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  renderItems();
};

function renderItems() {
  const grid = document.getElementById('items-grid');
  grid.innerHTML = '';
  
  const filtered = SHOP_ITEMS.filter(item => currentFilter === 'all' || item.category === currentFilter);
  
  filtered.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    const isFree = item.price === 0;
    const currencyType = item.currencyType || 'gold';
    const isPoints = currencyType === 'points';
    const currencyClass = isPoints ? 'points' : 'gold';
    const currencyIcon = isPoints ? 'fa-star' : 'fa-coins';
    const currencyName = isPoints ? 'Points' : 'Gold';
    
    card.innerHTML = `
      ${item.badge ? `<div class="badge ${isPoints ? 'points-badge' : ''}">${item.badge}</div>` : ''}
      <div class="item-icon">
        <i class="fas ${item.icon}" ${isPoints ? 'style="color: #00ccff;"' : ''}></i>
      </div>
      <h3 class="item-name">${item.name}</h3>
      <p class="item-desc">${item.description}</p>
      <div class="item-price ${isFree ? 'free' : currencyClass}" ${isPoints ? 'style="color: #00ccff;"' : ''}>
        ${isFree ? 'FREE' : `<i class="fas ${currencyIcon}"></i> ${item.price.toLocaleString()} ${currencyName}`}
      </div>
      <button class="claim-btn" onclick="openClaimModal('${item.id}')">
        ${isFree ? 'Claim Reward' : 'Purchase'}
      </button>
    `;
    grid.appendChild(card);
  });
}

window.openClaimModal = (itemId) => {
  if (!auth.currentUser) {
    if (window.showNotification) {
      window.showNotification("Please login first to purchase rewards!", "warning");
    } else {
      alert("Please login first to purchase rewards!");
    }
    if (window.showAuthModal) window.showAuthModal();
    return;
  }
  
  currentItem = SHOP_ITEMS.find(i => i.id === itemId);
  document.getElementById('modal-item-name').innerText = currentItem.name;
  document.getElementById('modal-item-desc').innerText = currentItem.description;
  
  const priceDisplay = document.getElementById('modal-price-display');
  const currencyType = currentItem.currencyType || 'gold';
  const isPoints = currencyType === 'points';
  const currencyIcon = isPoints ? 'fa-star' : 'fa-coins';
  const currencyName = isPoints ? 'Points' : 'Gold';
  const currencyColor = isPoints ? '#00ccff' : 'var(--gold-color)';

  if (currentItem.price === 0) {
    priceDisplay.innerText = "Price: FREE";
    priceDisplay.style.color = "var(--success-color)";
  } else {
    priceDisplay.innerHTML = `Price: <i class="fas ${currencyIcon}"></i> ${currentItem.price.toLocaleString()} ${currencyName}`;
    priceDisplay.style.color = currencyColor;
  }

  document.getElementById('claim-modal').style.display = 'flex';
  document.getElementById('claim-status').innerText = '';
  
  // Disable button if user doesn't have enough balance
  const btn = document.getElementById('confirm-claim-btn');
  const userBalance = isPoints ? userPoints : userGold;
  
  if (userBalance < currentItem.price) {
    btn.disabled = true;
    btn.innerText = `Insufficient ${currencyName}`;
    document.getElementById('claim-status').innerText = `❌ You don't have enough ${currencyName} for this item.`;
    document.getElementById('claim-status').style.color = "var(--error-color)";
  } else {
    btn.disabled = false;
    btn.innerText = "Confirm Purchase";
  }
};

window.closeClaimModal = () => {
  document.getElementById('claim-modal').style.display = 'none';
};

window.executeClaim = async () => {
  const ignInput = document.getElementById('mc-username');
  const ign = ignInput.value.trim();
  const status = document.getElementById('claim-status');
  const btn = document.getElementById('confirm-claim-btn');
  
  if (!ign) {
    status.innerText = "❌ Please enter your Minecraft IGN!";
    status.style.color = "var(--error-color)";
    return;
  }
  
  btn.disabled = true;
  btn.innerText = "Processing...";
  status.innerText = "⏳ Connecting to server...";
  status.style.color = "var(--text-secondary)";
  
  try {
    const res = await fetch('/.netlify/functions/shop-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: auth.currentUser.uid,
        ign: ign,
        itemId: currentItem.id
      })
    });
    
    // Check if response is valid JSON
    const contentType = res.headers.get("content-type");
    let data;
    if (contentType && contentType.indexOf("application/json") !== -1) {
      data = await res.json();
    } else {
      const text = await res.text();
      console.error("Server returned non-JSON response:", text);
      throw new Error(`Server returned status ${res.status}. Check Netlify logs.`);
    }
    
    if (res.ok) {
      status.innerText = `✅ Success! Your item has been delivered.`;
      status.style.color = "var(--success-color)";
      btn.innerText = "Purchased!";
      
      if (window.showNotification) {
        window.showNotification(`Successfully purchased ${currentItem.name}!`, "success");
      }

      setTimeout(() => {
        closeClaimModal();
        btn.disabled = false;
        btn.innerText = "Confirm Purchase";
      }, 3000);
    } else {
      status.innerText = `❌ ${data.error || 'Failed to claim item.'}`;
      status.style.color = "var(--error-color)";
      btn.disabled = false;
      btn.innerText = "Try Again";
    }
  } catch (err) {
    status.innerText = `❌ Error: ${err.message}`;
    status.style.color = "var(--error-color)";
    btn.disabled = false;
    btn.innerText = "Try Again";
  }
};

// ====================================
// UTILITY & SERVER STATUS FUNCTIONS
// ====================================

window.showNotification = function (message, type = "success") {
    const container = document.getElementById('notification-container');
    if (!container) return;
    container.innerHTML = '';

    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: ${type === 'error' ? 'var(--error-color)' : type === 'warning' ? 'var(--warning-color)' : 'var(--success-color)'};
        color: white; padding: 15px 25px; border-radius: 8px; z-index: 9999;
        animation: slideIn 0.3s ease; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        max-width: 400px; word-wrap: break-word; font-family: 'Barlow', sans-serif;
    `;
    container.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
};

window.copyToClipboard = function (text) {
    navigator.clipboard.writeText(text).then(() => {
        window.showNotification('Copied to clipboard!');
    }).catch(err => {
        console.error('Copy failed:', err);
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        window.showNotification('Copied to clipboard!');
    });
};

window.copyIP = function () { window.copyToClipboard('titannetwork.eu'); };

window.joinServer = function () {
    const instructions = `To join TitanNetwork:\n1. Open Minecraft\n2. Click "Multiplayer"\n3. Click "Add Server"\n4. Enter: titannetwork.eu\n5. Click "Done" and join!`;
    alert(instructions);
    window.copyIP();
};

window.joinDiscord = function () {
    window.open('https://discord.gg/ExFhgvtFng', '_blank');
};

async function updateServerStatus() {
    const playerCount = document.getElementById('player-count');
    if (!playerCount) return;

    try {
        const response = await fetch('https://api.mcsrvstat.us/2/titannetwork.eu');
        if (!response.ok) throw new Error('Network response fallback');
        const data = await response.json();

        if (data.online) {
            const count = data.players?.online || 0;
            playerCount.textContent = `${count} Player${count !== 1 ? 's' : ''} Online`;
            playerCount.style.background = 'var(--accent-color)';
        } else {
            playerCount.textContent = 'Server Offline';
            playerCount.style.background = 'var(--error-color)';
        }
    } catch (error) {
        console.error('Error fetching server status:', error);
        playerCount.textContent = 'Status Unavailable';
    }
}
