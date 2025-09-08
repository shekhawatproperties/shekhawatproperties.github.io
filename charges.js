// charges.js

import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, getDoc, setDoc, deleteDoc, query, orderBy, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

lucide.createIcons();

const elements = {
    tenantList: document.getElementById('tenant-list'),
    searchTenantsInput: document.getElementById('search-tenants'),
    chargesPlaceholder: document.getElementById('charges-placeholder'),
    chargesContent: document.getElementById('charges-content'),
    notificationBtn: document.getElementById('notification-btn'),
    activityModal: document.getElementById('activity-modal'),
    closeActivityModalBtn: document.getElementById('close-activity-modal'),
};

let allTenants = [], allPayments = [];
let currentChargesListener = null;

const animateCounter = (element, finalValue) => {
    if (!element) return;
    let start = 0;
    const duration = 1500;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = finalValue / steps;
    element.textContent = '₹0';

    const counter = setInterval(() => {
        start += increment;
        if (start >= finalValue) {
            clearInterval(counter);
            start = finalValue;
        }
        element.textContent = `₹${Math.floor(start).toLocaleString('en-IN')}`;
    }, stepTime);
};

const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000; if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000; if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400; if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600; if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60; if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
};

function updateNotifications(payments, tenants) {
    const activityList = document.getElementById('activity-list');
    const notificationBadge = document.getElementById('notification-badge');
    if (!activityList || !notificationBadge) return;
    const recentPayments = payments.slice(0, 10);
    const lastReadTimestamp = parseInt(localStorage.getItem('lastReadTimestamp') || '0');
    const unreadCount = payments.filter(p => p.date.seconds * 1000 > lastReadTimestamp).length;

    if (unreadCount > 0) {
        notificationBadge.textContent = unreadCount;
        notificationBadge.classList.remove('hidden');
    } else {
        notificationBadge.classList.add('hidden');
    }

    if (recentPayments.length > 0) {
        activityList.innerHTML = recentPayments.map(payment => {
            const tenant = tenants.find(t => t.id === payment.tenantId);
            const tenantName = tenant ? tenant.name : '...';
            const paymentDate = new Date(payment.date.seconds * 1000);
            const formattedDate = paymentDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
            return `<div class="relative pb-4 timeline-item"><div class="absolute left-0 top-1 flex items-center justify-center w-6 h-6 bg-green-100 rounded-full ring-8 ring-white"><i data-lucide="dollar-sign" class="w-3 h-3 text-green-600"></i></div><div class="ml-10"><p class="text-sm break-words">Payment of <strong>₹${(payment.amount || 0).toLocaleString('en-IN')}</strong> received from <strong>${tenantName}</strong>.</p><p class="text-xs text-gray-500 mt-1">${formattedDate} &bull; ${timeAgo(paymentDate)}</p></div></div>`;
        }).join('');
    } else {
        activityList.innerHTML = '<p class="text-center text-gray-500 text-sm py-4">No recent activities.</p>';
    }
    lucide.createIcons();
}

const renderTenantList = () => {
    const searchTerm = elements.searchTenantsInput.value.toLowerCase();
    const filteredTenants = allTenants.filter(t => t.name.toLowerCase().includes(searchTerm));

    elements.tenantList.innerHTML = filteredTenants.length === 0
        ? `<p class="text-center text-gray-500">No tenants found.</p>`
        : filteredTenants.map(tenant => `
            <div data-id="${tenant.id}" class="tenant-list-item flex items-center space-x-3 p-3 rounded-lg cursor-pointer hover:bg-gray-100 border-r-4 border-transparent">
                <img src="${tenant.imageUrl || `https://placehold.co/40x40/e0e7ff/4f46e5?text=${tenant.name.charAt(0)}`}" class="w-10 h-10 rounded-full object-cover">
                <div><p class="font-semibold">${tenant.name}</p><p class="text-xs text-gray-500">${tenant.email || 'No email'}</p></div>
            </div>
        `).join('');
};

const updateSummaryCards = async (tenants) => {
    let totalBilledElectricity = 0, totalBilledOther = 0, totalUnbilledDue = 0;
    const chargePromises = tenants.map(t => getDocs(collection(db, `tenants/${t.id}/monthly_charges`)));
    const allChargesSnapshots = await Promise.all(chargePromises);

    allChargesSnapshots.forEach(snapshot => {
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.isBilled) {
                totalBilledElectricity += data.electricityBill || 0;
                totalBilledOther += data.otherCharges || 0;
            } else {
                totalUnbilledDue += (data.electricityBill || 0) + (data.otherCharges || 0);
            }
        });
    });

    animateCounter(document.getElementById('total-electricity-billed'), totalBilledElectricity);
    animateCounter(document.getElementById('total-other-billed'), totalBilledOther);
    animateCounter(document.getElementById('total-charges-due'), totalUnbilledDue);
};

const setupChargesPanel = (tenantId) => {
    const tenant = allTenants.find(t => t.id === tenantId);
    if (!tenant) return;

    elements.chargesPlaceholder.classList.add('hidden');
    elements.chargesContent.classList.remove('hidden');

    elements.chargesContent.innerHTML = `
        <h2 class="text-2xl font-bold mb-4">Manage Charges for <span style="color: var(--theme-color);">${tenant.name}</span></h2>
        <div class="space-y-6">
            <div>
                <div class="p-4 bg-gray-50 rounded-lg grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div class="md:col-span-2"><label for="charge-month" class="block text-sm font-medium text-gray-600">Select Month</label><input type="month" id="charge-month" class="mt-1 block w-full text-sm p-2 border border-gray-300 rounded-md"></div>
                    <div><label for="electricity-bill" class="block text-sm font-medium text-gray-600">Electricity Bill (₹)</label><input type="number" id="electricity-bill" placeholder="0" class="mt-1 block w-full text-sm p-2 border border-gray-300 rounded-md"></div>
                    <div><label for="other-charges" class="block text-sm font-medium text-gray-600">Other Charges (₹)</label><input type="number" id="other-charges" placeholder="0" class="mt-1 block w-full text-sm p-2 border border-gray-300 rounded-md"></div>
                    <div class="md:col-span-5"><label for="charges-description" class="block text-sm font-medium text-gray-600">Description (Optional)</label><textarea id="charges-description" rows="2" placeholder="e.g., Meter repair cost" class="mt-1 block w-full text-sm p-2 border border-gray-300 rounded-md"></textarea></div>
                    <div><button id="save-charges-btn" class="w-full text-white font-semibold py-2 px-4 rounded-lg text-sm hover:brightness-110" style="background-color: var(--theme-color);">Save Charges</button></div>
                </div>
            </div>
            <div><h3 class="font-bold text-lg mb-2">History of Monthly Charges</h3><div class="max-h-64 overflow-y-auto" id="charges-history-container"></div></div>
        </div>
    `;

    const chargeMonthInput = document.getElementById('charge-month');
    const electricityBillInput = document.getElementById('electricity-bill');
    const otherChargesInput = document.getElementById('other-charges');
    const chargesDescriptionInput = document.getElementById('charges-description');
    const saveChargesBtn = document.getElementById('save-charges-btn');
    const historyContainer = document.getElementById('charges-history-container');
    const chargesRef = collection(db, "tenants", tenantId, "monthly_charges");

    if (currentChargesListener) currentChargesListener();

    currentChargesListener = onSnapshot(query(chargesRef, orderBy('__name__', 'desc')), (snap) => {
        historyContainer.innerHTML = snap.empty
            ? `<p class="text-center text-gray-500 text-sm p-4">No charges added yet.</p>`
            : `<table class="w-full text-left text-sm"><thead class="bg-gray-50"><tr><th class="p-2 font-semibold">Month</th><th class="p-2 font-semibold">Electricity</th><th class="p-2 font-semibold">Other</th><th class="p-2 font-semibold">Status</th><th class="p-2 font-semibold text-right">Actions</th></tr></thead><tbody>${snap.docs.map(doc => {
                const data = doc.data();
                const [year, month] = doc.id.split('-');
                const monthName = new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'long' });
                const statusBadge = data.isBilled ? `<span class="text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full">Billed</span>` : `<span class="text-xs font-medium bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Unbilled</span>`;
                return `<tr class="border-b"><td class="p-2 font-semibold">${monthName} ${year}</td><td class="p-2">₹${(data.electricityBill || 0).toLocaleString('en-IN')}</td><td class="p-2">₹${(data.otherCharges || 0).toLocaleString('en-IN')}</td><td class="p-2">${statusBadge}</td><td class="p-2 text-right"><button data-month-id="${doc.id}" class="delete-charge-btn text-red-500 hover:text-red-700 p-1" title="Delete Charge"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button></td></tr>`
            }).join('')}</tbody></table>`;
        lucide.createIcons();
    });

    const loadMonthData = async (monthId) => {
        if (!monthId) return;
        const docSnap = await getDoc(doc(chargesRef, monthId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            electricityBillInput.value = data.electricityBill || '';
            otherChargesInput.value = data.otherCharges || '';
            chargesDescriptionInput.value = data.description || '';
        } else {
            electricityBillInput.value = ''; otherChargesInput.value = ''; chargesDescriptionInput.value = '';
        }
    };

    const now = new Date();
    const currentMonthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    chargeMonthInput.value = currentMonthId;
    loadMonthData(currentMonthId);

    chargeMonthInput.addEventListener('change', () => loadMonthData(chargeMonthInput.value));

    saveChargesBtn.addEventListener('click', async () => {
        const monthId = chargeMonthInput.value;
        if (!monthId) { window.showToast("Please select a month.", "error"); return; }

        try {
            const chargeDocRef = doc(chargesRef, monthId);
            const existingDoc = await getDoc(chargeDocRef);
            const isAlreadyBilled = existingDoc.exists() && existingDoc.data().isBilled === true;

            const dataToSave = {
                electricityBill: parseInt(electricityBillInput.value) || 0,
                otherCharges: parseInt(otherChargesInput.value) || 0,
                description: chargesDescriptionInput.value.trim(),
                isBilled: isAlreadyBilled
            };

            await setDoc(chargeDocRef, dataToSave, { merge: true });

            if (!isAlreadyBilled && (dataToSave.electricityBill > 0 || dataToSave.otherCharges > 0)) {
                const currentTenant = allTenants.find(t => t.id === tenantId);
                if (currentTenant && currentTenant.status === 'Paid') {
                    await setDoc(doc(db, "tenants", tenantId), { status: 'Due' }, { merge: true });
                    window.showToast(`Charges saved & tenant status updated to 'Due'.`, 'success');
                } else {
                    window.showToast(`Charges for ${monthId} saved successfully!`, 'success');
                }
            } else {
                window.showToast(`Charges for ${monthId} saved successfully!`, 'success');
            }

            updateSummaryCards(allTenants);

        } catch (error) {
            window.showToast("Error saving charges.", "error"); console.error(error);
        }
    });

    historyContainer.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-charge-btn');
        if (!deleteBtn) return;
        const monthId = deleteBtn.dataset.monthId;
        const monthName = new Date(monthId + '-02').toLocaleString('default', { month: 'long', year: 'numeric' });

        window.showConfirmModal('Delete Charge', `Are you sure you want to delete charges for <strong>${monthName}</strong>? This cannot be undone.`,
            async () => {
                await deleteDoc(doc(chargesRef, monthId));
                window.showToast('Charge deleted successfully.', 'success');
                updateSummaryCards(allTenants);
            }
        );
    });
};

onSnapshot(query(collection(db, "tenants"), where("status", "!=", "Archived"), orderBy("name")), (snap) => {
    allTenants = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTenantList();
    updateSummaryCards(allTenants);
    updateNotifications(allPayments, allTenants);
}, (error) => {
    console.error("Firestore query failed: ", error);
    elements.tenantList.innerHTML = `<p class="text-center text-red-500 p-4">Error loading tenants. Please check the developer console for a missing index error and click the link to create it.</p>`;
});

onSnapshot(query(collection(db, "payments"), orderBy("date", "desc")), (snap) => {
    allPayments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateNotifications(allPayments, allTenants);
});

elements.searchTenantsInput.addEventListener('input', renderTenantList);

elements.tenantList.addEventListener('click', (e) => {
    const tenantItem = e.target.closest('.tenant-list-item');
    if (!tenantItem) return;
    document.querySelectorAll('.tenant-list-item').forEach(item => item.classList.remove('active'));
    tenantItem.classList.add('active');
    const tenantId = tenantItem.dataset.id;
    setupChargesPanel(tenantId);
});

elements.notificationBtn.addEventListener('click', () => {
    elements.activityModal.classList.remove('hidden');
    if (allPayments.length > 0) {
        const latestTimestamp = allPayments[0].date.seconds * 1000;
        localStorage.setItem('lastReadTimestamp', latestTimestamp);
        updateNotifications(allPayments, allTenants);
    }
});
elements.closeActivityModalBtn.addEventListener('click', () => elements.activityModal.classList.add('hidden'));