import { db, auth } from './firebase-config.js';
import { doc, getDoc, addDoc, collection, Timestamp, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

lucide.createIcons();

const views = {
    loader: document.getElementById('loader'),
    payment: document.getElementById('payment-view'),
    cancelled: document.getElementById('cancelled-view'),
    pending: document.getElementById('pending-view'),
};

let tenantData = {};
let propertyData = {};
let settingsData = {};
let tenantId = null;
let totalAmountDue = 0;

const showToast = (message, type = 'error') => {
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

const showView = (viewName) => {
    Object.values(views).forEach(view => view.classList.add('hidden'));
    if(views[viewName]) {
        views[viewName].classList.remove('hidden');
        lucide.createIcons();
    }
};

const redirectToDashboard = (delay) => {
    setTimeout(() => { window.location.href = 'tenant-dashboard.html'; }, delay);
};

const copyUpiId = async () => {
    const upiId = document.getElementById('upi-id-display').textContent;
    try {
        await navigator.clipboard.writeText(upiId);
        showToast('UPI ID copied!', 'success');
    } catch (err) {
        showToast('Failed to copy UPI ID.', 'error');
    }
};

document.getElementById('copy-upi-btn').addEventListener('click', copyUpiId);

document.getElementById('paid-btn').addEventListener('click', async () => {
    const paidButton = document.getElementById('paid-btn');
    paidButton.disabled = true;
    paidButton.innerHTML = `<div class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"></div>`;

    try {
        const params = new URLSearchParams(window.location.search);
        if (totalAmountDue <= 0) throw new Error("Calculated amount is zero or less.");

        const dueDate = new Date(tenantData.dueDate.seconds * 1000);
        let chargeDate = new Date(dueDate);
        if (dueDate.getDate() < 15) {
            chargeDate.setMonth(chargeDate.getMonth() - 1);
        }
        const monthId = `${chargeDate.getFullYear()}-${String(chargeDate.getMonth() + 1).padStart(2, '0')}`;
        const chargesSnap = await getDoc(doc(db, "tenants", tenantId, "monthly_charges", monthId));

        let breakdown = { rent: tenantData.rent, electricity: 0, other: 0 };
        if (chargesSnap.exists()) {
            const chargesData = chargesSnap.data();
            breakdown.electricity = chargesData.electricityBill || 0;
            breakdown.other = chargesData.otherCharges || 0;
        }

        const paymentDataForAdmin = {
            tenantId: tenantId,
            amount: totalAmountDue,
            time: Timestamp.now(),
            paidToUpiId: settingsData.upiId,
            breakdown: breakdown,
            installmentNumber: parseInt(params.get('installment')) || null // NEW: Save installment number
        };
        await addDoc(collection(db, "pendingPayments"), paymentDataForAdmin);
        await setDoc(doc(db, "tenants", tenantId), { rejectionReason: '' }, { merge: true });
        showView('pending');
        redirectToDashboard(4000);
    } catch (error) {
        console.error("Error submitting payment:", error);
        showToast("Could not submit payment. Please try again.", "error");
        paidButton.disabled = false;
        paidButton.textContent = 'Yes, I Paid';
    }
});

document.getElementById('cancel-btn').addEventListener('click', () => {
    showView('cancelled');
    redirectToDashboard(2000);
});

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    
    const tenantSnap = await getDoc(doc(db, "tenants", user.uid));
    if (!tenantSnap.exists()) { window.location.href = 'index.html'; return; }
    const tenantDataHeader = tenantSnap.data();
    const avatarUrl = tenantDataHeader.imageUrl || `https://placehold.co/40x40/e0e7ff/4f46e5?text=${tenantDataHeader.name.charAt(0)}`;
    document.getElementById('tenant-name-header').textContent = tenantDataHeader.name;
    document.getElementById('tenant-id-header').textContent = `ID: ${tenantSnap.id.substring(0, 6).toUpperCase()}`;
    document.getElementById('tenant-avatar-header').src = avatarUrl;
    document.getElementById('sidebar-profile-img').src = avatarUrl;
    document.getElementById('sidebar-user-name').textContent = tenantDataHeader.name;
    document.getElementById('sidebar-user-email').textContent = tenantDataHeader.email;

    const params = new URLSearchParams(window.location.search);
    tenantId = params.get('tid');
    if (!tenantId || tenantId !== user.uid) {
        showToast("Error: Invalid tenant ID.", "error");
        window.location.href = 'tenant-dashboard.html';
        return;
    }

    try {
        const [settingsDoc, rulesDoc] = await Promise.all([
            getDoc(doc(db, "settings", "businessInfo")),
            getDoc(doc(db, "settings", "paymentRules"))
        ]);

        if (!settingsDoc.exists() || !rulesDoc.exists()) throw new Error("Required data not found.");

        tenantData = tenantSnap.data();
        settingsData = settingsDoc.data();
        const rulesData = rulesDoc.data();

        const propDoc = await getDoc(doc(db, "properties", tenantData.propertyId));
        if (!propDoc.exists()) throw new Error("Property data not found.");
        propertyData = propDoc.data();
        
        // UPDATED: Check for installment amount from URL first
        const installmentAmount = parseFloat(params.get('amount'));

        if (installmentAmount) {
            totalAmountDue = installmentAmount;
        } else {
            // Original full amount calculation logic (as a fallback)
            totalAmountDue = tenantData.rent || 0;
            const unbilledQuery = query(collection(db, "tenants", tenantId, "monthly_charges"), where("isBilled", "==", false));
            const unbilledSnaps = await getDocs(unbilledQuery);
            if (!unbilledSnaps.empty) {
                unbilledSnaps.forEach(doc => {
                    const charge = doc.data();
                    totalAmountDue += (charge.electricityBill || 0) + (charge.otherCharges || 0);
                });
            }
            const today = new Date(); today.setHours(0,0,0,0);
            const dueDate = new Date(tenantData.dueDate.seconds * 1000);
            const daysOverdue = Math.max(0, Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24)));
            if (daysOverdue > rulesData.gracePeriodDays) {
                const lateFee = (daysOverdue - rulesData.gracePeriodDays) * rulesData.lateFeePerDay;
                totalAmountDue += lateFee;
            }
        }

        // Update UI with the final amount
        document.getElementById('property-name').textContent = propertyData.name;
        document.getElementById('total-amount').textContent = `₹${totalAmountDue.toLocaleString('en-IN')}`;
        document.getElementById('amount-instructions').textContent = `₹${totalAmountDue.toLocaleString('en-IN')}`;
        document.getElementById('business-name-display').textContent = settingsData.businessName || 'Shekhawat Market';
        document.getElementById('upi-id-display').textContent = settingsData.upiId || 'not-found@upi';

        showView('payment');
    } catch (error) {
        console.error("Error loading payment page:", error);
        showToast("Error: " + error.message, "error");
        window.location.href = 'tenant-dashboard.html';
    }
});

let confirmCallback = null;
const showConfirmModal = (title, message, onConfirm) => {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').innerHTML = message;
    confirmCallback = onConfirm;
    document.getElementById('confirmation-modal').classList.remove('hidden');
};
const closeModal = () => { document.getElementById('confirmation-modal').classList.add('hidden'); confirmCallback = null; };
document.getElementById('confirm-action-btn').addEventListener('click', () => { if (confirmCallback) confirmCallback(); closeModal(); });
document.getElementById('cancel-action-btn').addEventListener('click', closeModal);

const menuBtn = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const menuOverlay = document.getElementById('menu-overlay');
const closeMenuBtn = document.getElementById('close-menu-btn');
const profileBtn = document.getElementById('profile-btn');
const profileDropdown = document.getElementById('profile-dropdown');
const logoutBtn = document.getElementById('logout-btn');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

menuBtn.addEventListener('click', () => {
    mobileMenu.classList.remove('-translate-x-full');
    menuOverlay.classList.remove('hidden');
});
closeMenuBtn.addEventListener('click', () => {
    mobileMenu.classList.add('-translate-x-full');
    menuOverlay.classList.add('hidden');
});
menuOverlay.addEventListener('click', () => {
    mobileMenu.classList.add('-translate-x-full');
    menuOverlay.classList.add('hidden');
});
profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('hidden');
});
const handleTenantLogout = () => {
    showConfirmModal('Logout', 'Are you sure you want to log out?', () => {
        signOut(auth).catch(error => console.error('Sign Out Error', error));
    });
};
logoutBtn.addEventListener('click', handleTenantLogout);
mobileLogoutBtn.addEventListener('click', handleTenantLogout);

document.addEventListener('click', (e) => {
    if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
        profileDropdown.classList.add('hidden');
    }
});
