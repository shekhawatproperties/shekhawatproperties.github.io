import { db, auth } from './firebase-config.js';
import { doc, getDoc, addDoc, collection, Timestamp, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

lucide.createIcons();

const views = {
    loader: document.getElementById('loader'),
    payment: document.getElementById('payment-view'),
    cancelled: document.getElementById('cancelled-view'),
    pending: document.getElementById('pending-view'),
};

let tenantData = {};
let settingsData = {};
let tenantId = null;
let amountToPay = 0; // NEW: This will hold the amount selected by the user

const showToast = (message, type = 'success') => {
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
        // UPDATED: Use the selected 'amountToPay' instead of the total amount
        if (amountToPay <= 0) throw new Error("Amount to pay must be greater than zero.");

        const paymentDataForAdmin = {
            tenantId: tenantId,
            amount: amountToPay, // CRITICAL CHANGE
            time: Timestamp.now(),
            paidToUpiId: settingsData.upiId,
        };
        await addDoc(collection(db, "pendingPayments"), paymentDataForAdmin);
        await setDoc(doc(db, "tenants", tenantId), { rejectionReason: '' }, { merge: true });
        
        showView('pending');
        redirectToDashboard(3000);

    } catch (error) {
        console.error("Error submitting payment:", error);
        showToast("Could not submit payment. Please try again.", "error");
        paidButton.disabled = false;
        paidButton.textContent = 'I Have Paid';
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
    
    // Populate header and sidebar
    const tenantDataHeader = tenantSnap.data();
    const avatarUrl = tenantDataHeader.imageUrl || `https://placehold.co/40x40/e0e7ff/4f46e5?text=${tenantDataHeader.name.charAt(0)}`;
    document.getElementById('tenant-name-header').textContent = tenantDataHeader.name;
    document.getElementById('tenant-id-header').textContent = `ID: ${tenantSnap.id.substring(0, 6).toUpperCase()}`;
    document.getElementById('tenant-avatar-header').src = avatarUrl;
    document.getElementById('sidebar-profile-img').src = avatarUrl;
    document.getElementById('sidebar-user-name').textContent = tenantDataHeader.name;
    document.getElementById('sidebar-user-email').textContent = tenantDataHeader.email;

    // --- NEW LOGIC STARTS HERE ---
    try {
        // NEW: Read all parameters from the URL sent by the dashboard
        const params = new URLSearchParams(window.location.search);
        tenantId = params.get('tid');
        const totalDue = parseFloat(params.get('totalDue') || '0');
        const amountPaid = parseFloat(params.get('amountPaid') || '0');
        const installments = parseInt(params.get('installments') || '1');

        if (!tenantId || tenantId !== user.uid || totalDue <= 0) {
            throw new Error("Invalid payment details from dashboard.");
        }
        
        tenantData = tenantSnap.data();
        const settingsDoc = await getDoc(doc(db, "settings", "businessInfo"));
        settingsData = settingsDoc.data();
        
        const propDoc = await getDoc(doc(db, "properties", tenantData.propertyId));
        const propertyData = propDoc.data();
        document.getElementById('property-name').textContent = propertyData.name;
        
        // DELETED: Removed the old block that recalculated the amount.
        // We now trust the 'totalDue' from the dashboard.

        // NEW: Calculate remaining and installment amounts
        const remainingDue = totalDue - amountPaid;
        const installmentAmount = (installments > 1) ? Math.round(totalDue / installments) : remainingDue;
        
        // Populate summary details
        // Corrected line
        document.getElementById('summary-total').textContent = `₹${totalDue.toLocaleString('en-IN')}`;
        document.getElementById('summary-paid').textContent = `₹${amountPaid.toLocaleString('en-IN')}`;
        document.getElementById('summary-remaining').textContent = `₹${remainingDue.toLocaleString('en-IN')}`;

        // Populate UPI details
        document.getElementById('business-name-display').textContent = settingsData.businessName || 'Shekhawat Market';
        document.getElementById('upi-id-display').textContent = settingsData.upiId || 'not-found@upi';

        // NEW: Logic to show/hide and manage installment options
        if (installments > 1 && remainingDue > 0) {
            document.getElementById('installment-options').classList.remove('hidden');

            document.getElementById('installment-amount-label').textContent = `Amount: ₹${installmentAmount.toLocaleString('en-IN')}`;
            document.getElementById('full-amount-label').textContent = `Amount: ₹${remainingDue.toLocaleString('en-IN')}`;

            amountToPay = installmentAmount; // Set initial amount to pay

            // Add event listeners to radio buttons
            document.querySelectorAll('input[name="paymentOption"]').forEach(radio => {
                radio.addEventListener('change', (event) => {
                    if (event.target.value === 'installment') {
                        amountToPay = Math.min(installmentAmount, remainingDue); // Pay installment, but not more than what's left
                    } else {
                        amountToPay = remainingDue;
                    }
                    document.getElementById('amount-instructions').textContent = `₹${amountToPay.toLocaleString('en-IN')}`;
                });
            });
        } else {
            amountToPay = remainingDue;
        }

        // Set the final display amount on initial load
        document.getElementById('amount-instructions').textContent = `₹${amountToPay.toLocaleString('en-IN')}`;

        showView('payment');

    } catch (error) {
        console.error("Error loading payment page:", error);
        showToast("Error: " + error.message, "error");
        redirectToDashboard(3000);
    }
});

// Sidebar menu logic (no changes)
const menuBtn = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const menuOverlay = document.getElementById('menu-overlay');
const closeMenuBtn = document.getElementById('close-menu-btn');
menuBtn.addEventListener('click', () => { mobileMenu.classList.remove('-translate-x-full'); menuOverlay.classList.remove('hidden'); });
closeMenuBtn.addEventListener('click', () => { mobileMenu.classList.add('-translate-x-full'); menuOverlay.classList.add('hidden'); });
menuOverlay.addEventListener('click', () => { mobileMenu.classList.add('-translate-x-full'); menuOverlay.classList.add('hidden'); });
