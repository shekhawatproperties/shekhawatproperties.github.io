// settings.js

import { db, auth } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- DOM Element Selectors ---
const elements = {
    saveAllBtn: document.getElementById('save-all-btn'),
    colorPalette: document.getElementById('color-palette'),
    avatarGallery: document.getElementById('avatar-gallery'),
    avatarCategoryFilters: document.getElementById('avatar-category-filters'),
    adminNameInput: document.getElementById('admin-name'),
    adminEmailInput: document.getElementById('admin-email'),
    businessNameInput: document.getElementById('business-name'),
    upiIdInput: document.getElementById('upi-id'),
    lateFeeInput: document.getElementById('late-fee'),
    gracePeriodInput: document.getElementById('grace-period'),
    paymentWindowInput: document.getElementById('paymentWindowDaysBefore'),
    msgDueTextarea: document.getElementById('msg-due'),
    msgOverdueTextarea: document.getElementById('msg-overdue'),
    msgLateFeeTextarea: document.getElementById('msg-latefee'),
};

// --- Avatar Logic ---
const avatarStyles = {
    'Illustrated & Fun': ['adventurer', 'micah', 'avataaars-neutral', 'big-smile', 'croodles', 'miniavs', 'notionists', 'open-peeps', 'thumbs'],
    'Robots & Sci-Fi': ['bottts', 'bottts-neutral', 'rings'],
    'Pixelated': ['pixel-art', 'pixel-art-neutral'],
    'Geometric & Initials': ['shapes', 'initials', 'identicon']
};
const allStyles = [...new Set(Object.values(avatarStyles).flat())];
const avatarCategories = { 'All': allStyles, ...avatarStyles };
let currentAvatarCategory = 'All';

const renderAvatarCategories = () => {
    elements.avatarCategoryFilters.innerHTML = Object.keys(avatarCategories).map(category => `
        <button data-category="${category}" class="category-filter-btn ${category === currentAvatarCategory ? 'active' : ''}">
            ${category}
        </button>
    `).join('');
};

const applyAvatarStyle = (style, email) => {
    const newImageUrl = `https://api.dicebear.com/8.x/${style}/svg?seed=${encodeURIComponent(email)}`;
    // Update shared elements managed by shared-admin.js
    document.getElementById('header-profile-img').src = newImageUrl;
    document.getElementById('sidebar-profile-img').src = newImageUrl;
    
    // Update gallery selection visual
    document.querySelectorAll('.avatar-preview').forEach(preview => {
        preview.classList.toggle('selected', preview.dataset.style === style);
    });
};

const renderAvatarGallery = (email, selectedStyle) => {
    const stylesToRender = avatarCategories[currentAvatarCategory];
    elements.avatarGallery.innerHTML = stylesToRender.map(style => `
        <button data-style="${style}" class="avatar-preview p-2 bg-slate-100 rounded-lg text-center hover:bg-slate-200 ${style === selectedStyle ? 'selected' : ''}">
            <img src="https://api.dicebear.com/8.x/${style}/svg?seed=${encodeURIComponent(email)}" alt="${style}" class="w-16 h-16 rounded-full mx-auto mb-2">
            <span class="text-xs font-medium capitalize">${style.replace(/-/g, ' ')}</span>
        </button>
    `).join('');
};

// --- Theme Color Logic ---
const applyThemeColor = (color) => {
    document.documentElement.style.setProperty('--theme-color', color);
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.classList.toggle('selected', swatch.dataset.color === color);
    });
};

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
};

// --- Data Loading and Saving ---
const loadAllSettings = async () => {
    try {
        const [infoSnap, rulesSnap, msgSnap] = await Promise.all([
          getDoc(doc(db, "settings", "businessInfo")),
          getDoc(doc(db, "settings", "paymentRules")),
          getDoc(doc(db, "settings", "reminderMessages"))
        ]);
        if (infoSnap.exists()) {
            const data = infoSnap.data();
            elements.businessNameInput.value = data.businessName || '';
            elements.upiIdInput.value = data.upiId || '';
        }
        if (rulesSnap.exists()) {
            const data = rulesSnap.data();
            elements.lateFeeInput.value = data.lateFeePerDay ?? 100;
            elements.gracePeriodInput.value = data.gracePeriodDays ?? 5;
            elements.paymentWindowInput.value = data.paymentWindowDaysBefore ?? 10;
        }
        if (msgSnap.exists()) {
            const data = msgSnap.data();
            const dueMsg = data.due || '';
            const overdueMsg = data.overdue || '';
            const lateFeeMsg = data.lateFee || '';
            elements.msgDueTextarea.value = dueMsg;
            elements.msgOverdueTextarea.value = overdueMsg;
            elements.msgLateFeeTextarea.value = lateFeeMsg;
            updateSavedMessageDisplay('due', dueMsg);
            updateSavedMessageDisplay('overdue', overdueMsg);
            updateSavedMessageDisplay('latefee', lateFeeMsg);
        }
    } catch (error) { 
        console.error("Error loading settings:", error);
        window.showToast("Failed to load settings.", "error");
    }
};

const saveAllSettings = async () => {
    elements.saveAllBtn.disabled = true;
    elements.saveAllBtn.innerHTML = `<div class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"></div>`;

    try {
        const user = auth.currentUser;
        const newName = elements.adminNameInput.value;
        if (user && newName && user.displayName !== newName) {
            await updateProfile(user, { displayName: newName });
            await setDoc(doc(db, "admins", user.uid), { name: newName }, { merge: true });
        }

        const infoToSave = { businessName: elements.businessNameInput.value, upiId: elements.upiIdInput.value };
        const dueMsg = elements.msgDueTextarea.value;
        const overdueMsg = elements.msgOverdueTextarea.value;
        const lateFeeMsg = elements.msgLateFeeTextarea.value;

        await Promise.all([
          setDoc(doc(db, "settings", "businessInfo"), infoToSave, { merge: true }),
          setDoc(doc(db, "settings", "paymentRules"), { 
              lateFeePerDay: parseInt(elements.lateFeeInput.value), 
              gracePeriodDays: parseInt(elements.gracePeriodInput.value), 
              paymentWindowDaysBefore: parseInt(elements.paymentWindowInput.value) 
          }, { merge: true }),
          setDoc(doc(db, "settings", "reminderMessages"), { due: dueMsg, overdue: overdueMsg, lateFee: lateFeeMsg }, { merge: true })
        ]);
        window.showToast('Settings saved successfully!');
        updateSavedMessageDisplay('due', dueMsg);
        updateSavedMessageDisplay('overdue', overdueMsg);
        updateSavedMessageDisplay('latefee', lateFeeMsg);
    } catch (error) {
        console.error("Error saving settings:", error);
        window.showToast("Could not save settings.", 'error');
    } finally {
        elements.saveAllBtn.disabled = false;
        elements.saveAllBtn.innerHTML = `Save All Settings`;
    }
};

const updateSavedMessageDisplay = (type, message) => {
    const displayEl = document.getElementById(`saved-msg-${type}`);
    if (message) {
        displayEl.innerHTML = `<strong>Currently Saved:</strong><br>"${message.replace(/"/g, '&quot;')}"`;
        displayEl.classList.remove('hidden');
    } else {
        displayEl.classList.add('hidden');
    }
};

// --- Page Initialization and Event Listeners ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        elements.adminEmailInput.value = user.email;
        elements.adminNameInput.value = user.displayName || 'Admin User';

        const savedAvatarStyle = localStorage.getItem('avatarStyle') || 'adventurer';
        renderAvatarCategories();
        renderAvatarGallery(user.email, savedAvatarStyle);

        loadAllSettings();
    }
});

applyThemeColor(localStorage.getItem('themeColor') || '#edbf6d');

elements.saveAllBtn.addEventListener('click', saveAllSettings);

elements.colorPalette.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (button) {
        const color = button.dataset.color;
        localStorage.setItem('themeColor', color);
        const rgb = hexToRgb(color);
        if (rgb) localStorage.setItem('themeRgb', rgb);
        applyThemeColor(color);
        location.reload(); 
    }
});

elements.avatarCategoryFilters.addEventListener('click', (e) => {
    const button = e.target.closest('.category-filter-btn');
    if (button) {
        currentAvatarCategory = button.dataset.category;
        const user = auth.currentUser;
        if (user) {
            const savedAvatarStyle = localStorage.getItem('avatarStyle') || 'adventurer';
            renderAvatarCategories();
            renderAvatarGallery(user.email, savedAvatarStyle);
        }
    }
});

elements.avatarGallery.addEventListener('click', (e) => {
    const button = e.target.closest('.avatar-preview');
    if (button) {
        const style = button.dataset.style;
        const user = auth.currentUser;
        if (user) {
            localStorage.setItem('avatarStyle', style);
            applyAvatarStyle(style, user.email);
            window.showToast(`Avatar style set to '${style}'!`, 'success');
        }
    }
});