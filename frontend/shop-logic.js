import './firebase-global.js';
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
    id: 'vote_crate_key',
    name: 'Vote Crate Key',
    category: 'items',
    icon: 'fa-key',
    description: 'A key to open the Vote Crate at spawn. Contains random rewards!',
    price: 25,
    command: 'crate give physical Vote {player} 1'
  },
  {
    id: 'money_boost',
    name: '$5,000 In-Game',
    category: 'currency',
    icon: 'fa-money-bill-wave',
    description: 'Boost your balance with a one-time gift of $5,000.',
    price: 1000,
    command: 'eco give {player} 5000'
  }
];

let currentFilter = 'all';
let currentItem = null;
let userGold = 0;

document.addEventListener('DOMContentLoaded', () => {
  // Load Navbar
  fetch('navbar-template.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('navbar-placeholder').innerHTML = html;
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'navbar-logic.js';
      document.body.appendChild(script);
    });

  renderItems();
  
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
  
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    const isFree = item.price === 0;
    card.innerHTML = `
      ${item.badge ? `<span class="badge">${item.badge}</span>` : ''}
      <i class="fas ${item.icon} item-icon"></i>
      <h3 class="item-name">${item.name}</h3>
      <p class="item-desc">${item.description}</p>
      <div class="item-price ${isFree ? 'free' : ''}">
        ${isFree ? 'FREE' : `<i class="fas fa-coins"></i> ${item.price.toLocaleString()} Gold`}
      </div>
      <button class="claim-btn" onclick="openClaimModal('${item.id}')">
        ${isFree ? 'Claim Now' : 'Purchase'}
      </button>
    `;
    grid.appendChild(card);
  });
}

window.openClaimModal = (itemId) => {
  if (!auth.currentUser) {
    alert("Please login first to claim rewards!");
    if (window.showAuthModal) window.showAuthModal();
    return;
  }
  
  currentItem = SHOP_ITEMS.find(i => i.id === itemId);
  document.getElementById('modal-item-name').innerText = `Claim ${currentItem.name}`;
  document.getElementById('modal-item-desc').innerText = currentItem.description;
  document.getElementById('claim-modal').style.display = 'flex';
  document.getElementById('claim-status').innerText = '';
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
      status.innerText = `✅ Success! Check your inventory in-game.`;
      status.style.color = "var(--success-color)";
      btn.innerText = "Claimed!";
      setTimeout(() => {
        closeClaimModal();
        btn.disabled = false;
        btn.innerText = "Confirm Claim";
      }, 3000);
    } else {
      status.innerText = `❌ Error: ${data.error || 'Failed to claim item.'}`;
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
