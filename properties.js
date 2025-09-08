// properties.js

import { db } from './firebase-config.js';
import { collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

lucide.createIcons();

const elements = {
    propertyTableBody: document.getElementById('property-table-body'),
    addPropertyBtn: document.getElementById('add-property-btn'),
    propertyModal: document.getElementById('property-modal'),
    modalTitle: document.getElementById('modal-title'),
    cancelPropertyBtn: document.getElementById('cancel-property-btn'),
    propertyForm: document.getElementById('property-form'),
    searchInput: document.getElementById('search-input'),
    typeFilter: document.getElementById('type-filter'),
    totalProperties: document.getElementById('total-properties'),
    occupiedProperties: document.getElementById('occupied-properties'),
    vacantProperties: document.getElementById('vacant-properties'),
    notificationBtn: document.getElementById('notification-btn'),
    activityModal: document.getElementById('activity-modal'),
    closeActivityModalBtn: document.getElementById('close-activity-modal'),
};

let allProperties = [], allTenants = [], allPayments = [];
let editingPropertyId = null;

const animateCounter = (element, finalValue) => {
    if (!element) return;
    let start = 0;
    const duration = 1500;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = finalValue / steps;
    element.textContent = '0';

    const counter = setInterval(() => {
        start += increment;
        if (start >= finalValue) {
            clearInterval(counter);
            start = finalValue;
        }
        element.textContent = `${Math.floor(start)}`;
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

// This function is duplicated across JS files and is a good candidate
// to be moved into shared-admin.js in a future refactor.
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

const getStatusBadge = (status) => {
    const badges = { 'Occupied': 'bg-green-100 text-green-700', 'Vacant': 'bg-amber-100 text-amber-700' };
    return `<span class="${badges[status] || ''} text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">${status}</span>`;
};

const renderTable = () => {
    const searchTerm = elements.searchInput.value.toLowerCase();
    const filterValue = elements.typeFilter.value;
    const filteredProperties = allProperties.filter(prop =>
        prop.name.toLowerCase().includes(searchTerm) &&
        (filterValue === 'all' || prop.type === filterValue)
    );

    if (filteredProperties.length === 0) {
        elements.propertyTableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500">No properties found.</td></tr>`;
        return;
    }

    elements.propertyTableBody.innerHTML = filteredProperties.map(prop => {
        const tenant = allTenants.find(t => t.propertyId === prop.id && t.status !== 'Archived');
        const status = tenant ? 'Occupied' : 'Vacant';
        return `
            <tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="p-4 font-semibold">${prop.name}</td>
                <td class="p-4">${prop.type}</td>
                <td class="p-4">${getStatusBadge(status)}</td>
                <td class="p-4">${tenant ? tenant.name : '<span class="text-gray-400">N/A</span>'}</td>
                <td class="p-4">₹${parseInt(prop.rent).toLocaleString('en-IN')}</td>
                <td class="p-4 text-center">
                    <button data-id="${prop.id}" class="edit-property-btn text-indigo-600 hover:underline text-sm font-semibold mr-4">Edit</button>
                    <button data-id="${prop.id}" class="delete-property-btn text-red-600 hover:underline text-sm font-semibold">Delete</button>
                </td>
            </tr>`;
    }).join('');
};

const updateSummary = () => {
    animateCounter(elements.totalProperties, allProperties.length);
    const occupiedCount = allProperties.filter(prop =>
        allTenants.some(t => t.propertyId === prop.id && t.status !== 'Archived')
    ).length;
    animateCounter(elements.occupiedProperties, occupiedCount);
    animateCounter(elements.vacantProperties, allProperties.length - occupiedCount);
};

const openPropertyModal = (propertyId = null) => {
    elements.propertyForm.reset();
    editingPropertyId = propertyId;
    if (propertyId) {
        const prop = allProperties.find(p => p.id === propertyId);
        elements.modalTitle.textContent = 'Edit Property';
        Object.keys(prop).forEach(key => {
            if (elements.propertyForm.elements[key]) {
                elements.propertyForm.elements[key].value = prop[key];
            }
        });
        document.getElementById('save-property-btn').textContent = 'Update Property';
    } else {
        elements.modalTitle.textContent = 'Add New Property';
        document.getElementById('save-property-btn').textContent = 'Save Property';
    }
    elements.propertyModal.classList.remove('hidden');
};

const closePropertyModal = () => elements.propertyModal.classList.add('hidden');

// --- Event Listeners & Initialization ---

onSnapshot(collection(db, "tenants"), (snapshot) => {
    allTenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTable();
    updateSummary();
    updateNotifications(allPayments, allTenants);
});

onSnapshot(collection(db, "properties"), (snapshot) => {
    allProperties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTable();
    updateSummary();
});

onSnapshot(query(collection(db, "payments"), orderBy("date", "desc")), (snap) => {
    allPayments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateNotifications(allPayments, allTenants);
});

elements.addPropertyBtn.addEventListener('click', () => openPropertyModal());
elements.cancelPropertyBtn.addEventListener('click', closePropertyModal);
elements.searchInput.addEventListener('input', renderTable);
elements.typeFilter.addEventListener('change', renderTable);

elements.notificationBtn.addEventListener('click', () => {
    elements.activityModal.classList.remove('hidden');
    if (allPayments.length > 0) {
        const latestTimestamp = allPayments[0].date.seconds * 1000;
        localStorage.setItem('lastReadTimestamp', latestTimestamp);
        updateNotifications(allPayments, allTenants);
    }
});
elements.closeActivityModalBtn.addEventListener('click', () => elements.activityModal.classList.add('hidden'));

elements.propertyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target).entries());
    const dataToSave = { ...formData, rent: parseInt(formData.rent) };
    try {
        if (editingPropertyId) {
            await setDoc(doc(db, "properties", editingPropertyId), dataToSave, { merge: true });
            window.showToast('Property updated successfully!');
        } else {
            await addDoc(collection(db, "properties"), dataToSave);
            window.showToast('Property added successfully!');
        }
        closePropertyModal();
    } catch (error) {
        console.error("Error saving property: ", error);
        window.showToast("Could not save property.", 'error');
    }
});

elements.propertyTableBody.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const propertyId = button.dataset.id;
    if (button.classList.contains('edit-property-btn')) {
        openPropertyModal(propertyId);
    } else if (button.classList.contains('delete-property-btn')) {
        const isOccupied = allTenants.some(t => t.propertyId === propertyId && t.status !== 'Archived');
        if (isOccupied) {
            window.showToast('Cannot delete property with an active tenant.', 'error');
            return;
        }
        const prop = allProperties.find(p => p.id === propertyId);
        if (!prop) return;
        window.showConfirmModal('Delete Property?', `Are you sure you want to delete <strong>${prop.name}</strong>? This action cannot be undone.`, async () => {
            try {
                await deleteDoc(doc(db, "properties", propertyId));
                window.showToast('Property deleted.');
            } catch (error) {
                console.error("Error deleting property: ", error);
                window.showToast('Could not delete property.', 'error');
            }
        });
    }
});