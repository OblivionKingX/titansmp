import './firebase-global.js';
import { initNavbar, updateUIForUser } from './navbar-logic.js';
const { auth, onAuthStateChanged, db, ref, get, onValue } = window.firebaseApp;


// Shop Items Configuration (loaded dynamically from Firebase)
let SHOP_ITEMS = [];

let currentFilter = 'all';
let currentItem = null;
let userGold = 0;
let userPoints = 0;

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  
  // Listen for shop items from Firebase database
  const shopItemsRef = ref(db, 'shop_items');
  onValue(shopItemsRef, (snapshot) => {
    SHOP_ITEMS = snapshot.val() || [];
    renderItems();
  });

  updateServerStatus();
  setInterval(updateServerStatus, 30000);


  window.toggleMobileMenu = function () {
    const navLinks = document.getElementById('nav-links');
    if (navLinks) navLinks.classList.toggle('active');
  };


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

    const currencyType = item.currencyType || 'gold';
    const isFree = ((currencyType === 'points' && item.pricePoints === 0) || (currencyType !== 'points' && item.priceGold === 0)) && currencyType !== 'both' && currencyType !== 'either';

    let priceHtml = '';
    let priceClass = '';
    let iconColor = '';

    if (isFree) {
      priceHtml = 'FREE';
      priceClass = 'free';
    } else if (currencyType === 'both') {
      priceHtml = `<i class="fas fa-coins"></i> ${item.priceGold.toLocaleString()} & <i class="fas fa-star" style="color: #00ccff;"></i> ${item.pricePoints.toLocaleString()}`;
      priceClass = 'gold';
    } else if (currencyType === 'either') {
      priceHtml = `<i class="fas fa-coins"></i> ${item.priceGold.toLocaleString()} / <i class="fas fa-star" style="color: #00ccff;"></i> ${item.pricePoints.toLocaleString()}`;
      priceClass = 'gold';
    } else if (currencyType === 'points') {
      priceHtml = `<i class="fas fa-star"></i> ${item.pricePoints.toLocaleString()} Points`;
      priceClass = 'points';
      iconColor = 'color: #00ccff;';
    } else {
      priceHtml = `<i class="fas fa-coins"></i> ${item.priceGold.toLocaleString()} Gold`;
      priceClass = 'gold';
    }

    card.innerHTML = `
      ${item.badge ? `<div class="badge ${currencyType === 'points' || currencyType === 'both' ? 'points-badge' : ''}">${item.badge}</div>` : ''}
      <div class="item-icon">
        <i class="fas ${item.icon}" style="${iconColor}"></i>
      </div>
      <h3 class="item-name">${item.name}</h3>
      <p class="item-desc">${item.description}</p>
      <div class="item-price ${priceClass}" style="${iconColor}">
        ${priceHtml}
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
  document.getElementById('modal-item-name').innerHTML = currentItem.name;
  document.getElementById('modal-item-desc').innerHTML = currentItem.description;

  const priceDisplay = document.getElementById('modal-price-display');
  const currencySelector = document.getElementById('currency-selector');
  const currencyType = currentItem.currencyType || 'gold';

  currencySelector.style.display = 'none';

  if (currencyType === 'both') {
    priceDisplay.innerHTML = `Price: <i class="fas fa-coins"></i> ${currentItem.priceGold.toLocaleString()} Gold & <i class="fas fa-star" style="color: #00ccff;"></i> ${currentItem.pricePoints.toLocaleString()} Points`;
    priceDisplay.style.color = "var(--gold-color)";
  } else if (currencyType === 'either') {
    priceDisplay.innerHTML = `Price: <i class="fas fa-coins"></i> ${currentItem.priceGold.toLocaleString()} Gold OR <i class="fas fa-star" style="color: #00ccff;"></i> ${currentItem.pricePoints.toLocaleString()} Points`;
    priceDisplay.style.color = "var(--gold-color)";
    currencySelector.style.display = 'block';
  } else if ((currencyType === 'points' && currentItem.pricePoints === 0) || (currencyType !== 'points' && currentItem.priceGold === 0)) {
    priceDisplay.innerText = "Price: FREE";
    priceDisplay.style.color = "var(--success-color)";
  } else if (currencyType === 'points') {
    priceDisplay.innerHTML = `Price: <i class="fas fa-star"></i> ${currentItem.pricePoints.toLocaleString()} Points`;
    priceDisplay.style.color = '#00ccff';
  } else {
    priceDisplay.innerHTML = `Price: <i class="fas fa-coins"></i> ${currentItem.priceGold.toLocaleString()} Gold`;
    priceDisplay.style.color = 'var(--gold-color)';
  }

  document.getElementById('claim-modal').style.display = 'flex';
  document.getElementById('claim-status').innerText = '';

  if (currencyType === 'either') {
    document.querySelector('input[name="payment_method"][value="gold"]').checked = true;
  }

  updateModalBalance();
};

window.updateModalBalance = () => {
  if (!currentItem) return;
  const btn = document.getElementById('confirm-claim-btn');
  const status = document.getElementById('claim-status');
  const currencyType = currentItem.currencyType || 'gold';
  status.innerText = '';

  if (currencyType === 'both') {
    if (userGold < currentItem.priceGold || userPoints < currentItem.pricePoints) {
      btn.disabled = true;
      btn.innerText = `Insufficient Funds`;
      status.innerText = `❌ You need ${currentItem.priceGold} Gold AND ${currentItem.pricePoints} Points.`;
      status.style.color = "var(--error-color)";
    } else {
      btn.disabled = false;
      btn.innerText = "Confirm Purchase";
    }
  } else if (currencyType === 'either') {
    const selectedMethod = document.querySelector('input[name="payment_method"]:checked').value;
    const requiredAmount = selectedMethod === 'gold' ? currentItem.priceGold : currentItem.pricePoints;
    const balance = selectedMethod === 'gold' ? userGold : userPoints;
    const currencyName = selectedMethod === 'gold' ? 'Gold' : 'Points';

    if (balance < requiredAmount) {
      btn.disabled = true;
      btn.innerText = `Insufficient ${currencyName}`;
      status.innerText = `❌ You don't have enough ${currencyName} for this item.`;
      status.style.color = "var(--error-color)";
    } else {
      btn.disabled = false;
      btn.innerText = `Pay with ${currencyName}`;
    }
  } else {
    const isPoints = currencyType === 'points';
    const userBalance = isPoints ? userPoints : userGold;
    const currencyName = isPoints ? 'Points' : 'Gold';
    const requiredAmount = isPoints ? currentItem.pricePoints : currentItem.priceGold;
    if (userBalance < requiredAmount) {
      btn.disabled = true;
      btn.innerText = `Insufficient ${currencyName}`;
      status.innerText = `❌ You don't have enough ${currencyName} for this item.`;
      status.style.color = "var(--error-color)";
    } else {
      btn.disabled = false;
      btn.innerText = "Confirm Purchase";
    }
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

  const currencyType = currentItem.currencyType || 'gold';
  let paymentMethod = currencyType;
  if (currencyType === 'either') {
    paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;
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
        itemId: currentItem.id,
        paymentMethod: paymentMethod
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
