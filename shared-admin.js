// shared-admin.js

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- START: SHARED UTILITY FUNCTIONS ---

let confirmCallback = null;

// Standardized Toast Notification
window.showToast = (message, type = 'success') => {
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-5 right-5 z-[100] space-y-2';
        document.body.appendChild(container);
    }
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    const icon = type === 'success' ? '<i data-lucide="check-circle" class="w-5 h-5"></i>' : '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
    toast.className = `flex items-center space-x-3 p-3 rounded-lg text-white font-semibold shadow-lg toast-in ${bgColor}`;
    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => {
        toast.classList.remove('toast-in');
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
};

// Standardized Confirmation Modal
window.showConfirmModal = (title, message, onConfirm) => {
    const modal = document.getElementById('confirmation-modal');
    if (!modal) return;
    modal.querySelector('#confirm-modal-title').textContent = title;
    modal.querySelector('#confirm-modal-message').innerHTML = message;
    confirmCallback = onConfirm;
    modal.classList.remove('hidden');
    lucide.createIcons(); // Ensure icons are rendered
};

const closeModal = () => {
    const modal = document.getElementById('confirmation-modal');
    if(modal) modal.classList.add('hidden');
    confirmCallback = null;
};

// --- END: SHARED UTILITY FUNCTIONS ---


// --- START: AUTH & UI INITIALIZATION ---

onAuthStateChanged(auth, async (user) => {
    // Session Timeout Logic (Centralized)
    const loginTimestamp = localStorage.getItem('adminLoginTimestamp');
    const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    if (loginTimestamp && (Date.now() - loginTimestamp > SESSION_DURATION)) {
        console.log("Admin session expired. Logging out.");
        showToast("Session expired. Please log in again.", "error");
        await signOut(auth); // This will trigger the user check below to redirect
        return;
    }

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const adminSnap = await getDoc(doc(db, "admins", user.uid));
    if (!adminSnap.exists()) {
        window.location.href = 'index.html';
        return;
    }

    const adminData = adminSnap.data();
    const savedAvatarStyle = localStorage.getItem('avatarStyle') || 'adventurer';
    const newImageUrl = `https://api.dicebear.com/8.x/${savedAvatarStyle}/svg?seed=${encodeURIComponent(user.email)}`;

    // Populate user info in header and sidebar
    const elementsToUpdate = {
        'header-profile-img': 'src',
        'sidebar-profile-img': 'src',
        'sidebar-user-name': 'textContent',
        'sidebar-user-email': 'textContent'
    };

    if(document.getElementById('header-profile-img')) document.getElementById('header-profile-img').src = newImageUrl;
    if(document.getElementById('sidebar-profile-img')) document.getElementById('sidebar-profile-img').src = newImageUrl;
    if(document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').textContent = adminData.name || 'Admin';
    if(document.getElementById('sidebar-user-email')) document.getElementById('sidebar-user-email').textContent = user.email;

});

// --- END: AUTH & UI INITIALIZATION ---


// --- START: GLOBAL EVENT LISTENERS & UI LOGIC ---

// This function runs when the main HTML document is fully loaded
document.addEventListener('DOMContentLoaded', () => {

    // Add confirmation modal HTML to the body if it doesn't exist
    if (!document.getElementById('confirmation-modal')) {
        const modalHTML = `
            <div id="confirmation-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div class="p-5 border-b flex items-center space-x-3">
                        <div class="bg-red-100 p-2 rounded-full"><i data-lucide="alert-triangle" class="w-6 h-6 text-red-600"></i></div>
                        <h2 id="confirm-modal-title" class="text-2xl font-bold text-gray-800">Confirm Action</h2>
                    </div>
                    <div class="p-6"><p id="confirm-modal-message" class="text-gray-600">Are you sure?</p></div>
                    <div class="p-5 bg-gray-50 flex justify-end space-x-4 rounded-b-lg">
                        <button id="cancel-action-btn" class="px-5 py-2 rounded-lg text-gray-800 bg-gray-200 hover:bg-gray-300 font-semibold">Cancel</button>
                        <button id="confirm-action-btn" class="px-5 py-2 rounded-lg text-white font-semibold bg-red-600 hover:bg-red-700">Confirm</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    // --- Setup all event listeners ---
    const menuBtn = document.getElementById('menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuOverlay = document.getElementById('menu-overlay');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const profileBtn = document.getElementById('profile-btn');
    const profileDropdown = document.getElementById('profile-dropdown');

    if(menuBtn) menuBtn.addEventListener('click', () => { mobileMenu.classList.toggle('-translate-x-full'); menuOverlay.classList.toggle('hidden'); });
    if(menuOverlay) menuOverlay.addEventListener('click', () => { mobileMenu.classList.add('-translate-x-full'); menuOverlay.classList.add('hidden'); });
    if(closeMenuBtn) closeMenuBtn.addEventListener('click', () => { mobileMenu.classList.add('-translate-x-full'); menuOverlay.classList.add('hidden'); });
    if(profileBtn) profileBtn.addEventListener('click', () => profileDropdown.classList.toggle('hidden'));
    
    document.addEventListener('click', (e) => {
        if (profileBtn && !profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
            profileDropdown.classList.add('hidden');
        }
    });

    const handleLogout = () => showConfirmModal('Logout', 'Are you sure you want to log out?', () => signOut(auth).catch(err => console.error(err)));
    
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('confirm-action-btn')?.addEventListener('click', () => { if (confirmCallback) confirmCallback(); closeModal(); });
    document.getElementById('cancel-action-btn')?.addEventListener('click', closeModal);
    
    // Notification logic
    const notificationBtn = document.getElementById('notification-btn');
    const activityModal = document.getElementById('activity-modal');
    const closeActivityModalBtn = document.getElementById('close-activity-modal');

    if (notificationBtn) notificationBtn.addEventListener('click', () => {
        activityModal?.classList.remove('hidden');
    });
    if (closeActivityModalBtn) closeActivityModalBtn.addEventListener('click', () => activityModal?.classList.add('hidden'));

    // Global Pending Payments Badge
    onSnapshot(collection(db, "pendingPayments"), (snap) => {
        const navPaymentsLink = document.getElementById('nav-payments-link');
        if (navPaymentsLink) {
            const existingBadge = navPaymentsLink.querySelector('.notification-badge');
            if (existingBadge) existingBadge.remove();
            if (!snap.empty) {
                const badge = document.createElement('span');
                badge.className = 'notification-badge absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center';
                badge.textContent = snap.size;
                navPaymentsLink.appendChild(badge);
            }
        }
    });
});