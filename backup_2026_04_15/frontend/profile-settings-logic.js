import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getDatabase, ref, update } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import './firebase-global.js';
import { getUserMetadata } from "./user-metadata-logic.js";

const { auth, db } = window.firebaseApp;

/**
 * Compresses an image File to a JPEG dataURL at max 256x256px.
 */
function compressImage(file, maxSize = 256, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

let currentMode = 'upload';
let currentUser = null;
let selectedFile = null;

const optCustom = document.getElementById('opt-custom');
const optMC = document.getElementById('opt-mc');
const inputCustom = document.getElementById('input-custom');
const inputMC = document.getElementById('input-mc');
const pfpFile = document.getElementById('pfp-file');
const previewImg = document.getElementById('preview-img');
const bioInput = document.getElementById('bio-input');
const saveBtn = document.getElementById('save-btn');
const notif = document.getElementById('notification');

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = user;
    loadSettings();
});

async function loadSettings() {
    const meta = await getUserMetadata(currentUser.uid);
    if (!meta) return;

    // Fill read-only
    document.getElementById('email-val').textContent = currentUser.email;
    document.getElementById('joined-val').textContent = meta.joined;
    document.getElementById('posts-val').textContent = meta.messageCount;
    
    // Fill editable
    bioInput.value = meta.bio !== 'No bio yet.' ? meta.bio : '';
    previewImg.src = meta.pfpUrl;
    
    // Check if it's a minotar URL or other
    if (meta.pfpUrl.includes('minotar.net')) {
        setMode('mc');
        const username = meta.pfpUrl.split('/').pop();
        if (username !== '100') {
            document.getElementById('mc-username').value = username;
        }
    } else {
        setMode('upload');
    }

    document.getElementById('settings-loading').style.display = 'none';
    document.getElementById('settings-form-content').style.display = 'block';
}

function setMode(mode) {
    currentMode = mode;
    optCustom.classList.toggle('active', mode === 'upload');
    optMC.classList.toggle('active', mode === 'mc');
    inputCustom.style.display = mode === 'upload' ? 'block' : 'none';
    inputMC.style.display = mode === 'mc' ? 'block' : 'none';
}

optCustom.onclick = () => setMode('upload');
optMC.onclick = () => setMode('mc');

// Handle file selection and preview
pfpFile.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            showNotif("File too large (max 2MB)", "error");
            pfpFile.value = '';
            return;
        }
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (re) => {
            previewImg.src = re.target.result;
        };
        reader.readAsDataURL(file);
    }
};

document.getElementById('mc-username').oninput = (e) => {
    const user = e.target.value.trim();
    if (user) {
        previewImg.src = `https://minotar.net/avatar/${user}/100`;
    }
};

saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Saving...';

    console.log("Save initiated. Mode:", currentMode);
    const updates = {};
    updates[`users/${currentUser.uid}/bio`] = bioInput.value.trim();
    
    try {
        let finalPfp = previewImg.src;

        if (currentMode === 'mc') {
            console.log("Saving Minecraft Skin...");
            const mcUser = document.getElementById('mc-username').value.trim();
            finalPfp = mcUser ? `https://minotar.net/avatar/${mcUser}/100` : "https://cdn.pfps.gg/pfps/2331-minecraft-cat.png";
        } else if (currentMode === 'upload' && selectedFile) {
            console.log("Compressing and saving image...");
            showNotif("Compressing image...", "success");
            finalPfp = await compressImage(selectedFile);
            console.log("Image compressed, size:", Math.round(finalPfp.length / 1024) + 'KB');
        }

        // Never save a massive DataURL check - limit to ~500KB in the DB
        if (finalPfp.startsWith('data:image') && finalPfp.length > 600000) {
            throw new Error("Image is too large even after compression. Please choose a smaller image.");
        }

        console.log("Updating database with PFP:", finalPfp);
        updates[`pfp/${currentUser.uid}`] = finalPfp || "https://cdn.pfps.gg/pfps/2331-minecraft-cat.png";

        await update(ref(db), updates);
        console.log("Database update successful.");

        // SYNC TO TEAM COLLECTION (IF STAFF)
        try {
            const { fs, doc, setDoc, fsTimestamp } = window.firebaseApp;
            const meta = await getUserMetadata(currentUser.uid, true); // Get fresh rank
            const STAFF_ROLES = ['owner', 'co-owner', 'admin', 'manager', 'mod', 'moderator', 'staff', 'helper', 'developer', 'lead developer', 'builder'];
            const isStaff = STAFF_ROLES.includes((meta.rank || '').toLowerCase()) || 
                            (meta.ranks || []).some(r => STAFF_ROLES.includes(r.toLowerCase()));

            if (isStaff && currentUser.email) {
                console.log("Syncing PFP change to Team collection for staff member...");
                const emailLower = currentUser.email.toLowerCase();
                await setDoc(doc(fs, "team", emailLower), {
                    pfp: finalPfp,
                    username: meta.username || currentUser.displayName || emailLower.split('@')[0],
                    role: meta.rank || 'Staff',
                    updatedAt: fsTimestamp()
                }, { merge: true });
                console.log("Team collection sync successful.");
            }
        } catch (syncErr) {
            console.warn("Failed to sync PFP change to Team collection:", syncErr.message);
        }
        
        showNotif("Settings saved successfully!", "success");
        setTimeout(() => {
            window.location.href = `profile.html?user=${currentUser.uid}`;
        }, 1500);
    } catch (err) {
        console.error("Save Error:", err);
        showNotif(err.message || "Error saving settings", "error");
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
};

document.getElementById('cancel-btn').onclick = () => {
    window.location.href = `profile.html?user=${currentUser.uid}`;
};

function showNotif(msg, type) {
    notif.textContent = msg;
    notif.className = `notif-${type}`;
    notif.style.display = 'block';
    setTimeout(() => { notif.style.display = 'none'; }, 3000);
}

