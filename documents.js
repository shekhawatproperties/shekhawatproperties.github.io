// documents.js

import { db } from './firebase-config.js';
import { collection, onSnapshot, addDoc, doc, deleteDoc, Timestamp, getDocs, query, orderBy, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let allDocuments = [], allTenants = [], allPayments = [];

const elements = {
    addDocBtn: document.getElementById('add-doc-btn'),
    addDocModal: document.getElementById('add-doc-modal'),
    cancelAddBtn: document.getElementById('cancel-add-btn'),
    saveDocBtn: document.getElementById('save-doc-btn'),
    addDocForm: document.getElementById('add-doc-form'),
    tenantSelect: document.getElementById('doc-tenant'),
    folderView: document.getElementById('folder-view'),
    tableView: document.getElementById('table-view'),
    viewHeader: document.getElementById('view-header'),
    tableTitle: document.getElementById('table-title'),
    docsTableBody: document.getElementById('docs-table-body'),
    searchInput: document.getElementById('search-input'),
    totalDocs: document.getElementById('total-docs'),
    tenantsWithDocs: document.getElementById('tenants-with-docs'),
    notificationBtn: document.getElementById('notification-btn'),
    activityModal: document.getElementById('activity-modal'),
    closeActivityModalBtn: document.getElementById('close-activity-modal'),
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

const populateDropdowns = () => {
    elements.tenantSelect.innerHTML = '<option value="">Select Tenant</option>' + allTenants.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
};

const renderFolders = () => {
    elements.tableView.classList.add('hidden');
    elements.folderView.classList.remove('hidden');

    const backButton = elements.viewHeader.querySelector('#back-btn');
    if (backButton) backButton.remove();
    elements.tableTitle.textContent = 'Tenant Folders';

    const searchTerm = elements.searchInput.value.toLowerCase();
    const filteredTenants = allTenants.filter(t => t.name.toLowerCase().includes(searchTerm));

    elements.folderView.innerHTML = filteredTenants.length === 0
        ? `<p class="text-gray-500 col-span-full text-center">No tenants found.</p>`
        : filteredTenants.map(tenant => {
            const docCount = allDocuments.filter(doc => doc.tenantId === tenant.id).length;
            return `
                <div data-id="${tenant.id}" data-name="${tenant.name}" class="folder-item p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-indigo-50 border flex items-center space-x-4" style="--tw-hover-bg-color: rgba(var(--theme-rgb), 0.05);">
                    <i data-lucide="folder" class="h-10 w-10 flex-shrink-0" style="color: ${docCount > 0 ? 'var(--theme-color)' : '#9ca3af'};"></i>
                    <div class="flex-grow text-left overflow-hidden"><p class="font-semibold text-gray-800 truncate">${tenant.name}</p><p class="text-sm text-gray-500">${docCount} document(s)</p></div>
                    <i data-lucide="chevron-right" class="h-5 w-5 text-gray-400"></i>
                </div>`;
        }).join('');
    lucide.createIcons();
};

const renderTable = (tenantId, tenantName) => {
    elements.folderView.classList.add('hidden');
    elements.tableView.classList.remove('hidden');

    if (!elements.viewHeader.querySelector('#back-btn')) {
        const backButton = document.createElement('button');
        backButton.id = 'back-btn';
        backButton.className = 'text-sm font-semibold hover:underline flex items-center';
        backButton.style.color = 'var(--theme-color)';
        backButton.innerHTML = `<i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i> Back to Folders`;
        elements.viewHeader.prepend(backButton);
        backButton.addEventListener('click', renderFolders);
    }

    elements.tableTitle.textContent = `Documents for ${tenantName}`;
    const filteredDocs = allDocuments.filter(doc => doc.tenantId === tenantId);

    elements.docsTableBody.innerHTML = filteredDocs.length === 0
        ? `<tr><td colspan="4" class="p-4 text-center text-gray-500">No documents found.</td></tr>`
        : filteredDocs.map(doc => {
            const addedDate = doc.uploadDate ? new Date(doc.uploadDate.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
            return `
            <tr class="border-b border-gray-100">
                <td class="p-4 font-semibold">${doc.name}</td>
                <td class="p-4">${doc.category}</td>
                <td class="p-4">${addedDate}</td>
                <td class="p-4 text-center space-x-2">
                    <a href="${doc.url}" target="_blank" class="inline-block text-gray-500 hover:text-indigo-600 p-1" title="View"><i data-lucide="eye" class="w-5 h-5"></i></a>
                    <button data-id="${doc.id}" class="delete-doc-btn text-gray-500 hover:text-red-600 p-1" title="Delete"><i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i></button>
                </td>
            </tr>`}).join('');
    lucide.createIcons();
};

const updateSummary = () => {
    elements.totalDocs.textContent = allDocuments.length;
    const tenantsWithDocs = new Set(allDocuments.map(doc => doc.tenantId));
    elements.tenantsWithDocs.textContent = tenantsWithDocs.size;
};

const init = async () => {
    try {
        const tenantsQuery = query(collection(db, "tenants"), where("status", "!=", "Archived"));
        const docsQuery = collection(db, "documents");
        const paymentsQuery = query(collection(db, "payments"), orderBy("date", "desc"));

        const [tenantSnap, docSnap, paymentSnap] = await Promise.all([getDocs(tenantsQuery), getDocs(docsQuery), getDocs(paymentsQuery)]);

        allTenants = tenantSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        allDocuments = docSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        allPayments = paymentSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        populateDropdowns();
        renderFolders();
        updateSummary();
        updateNotifications(allPayments, allTenants);
        lucide.createIcons();

        onSnapshot(tenantsQuery, snap => { allTenants = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderFolders(); populateDropdowns(); updateNotifications(allPayments, allTenants); });
        onSnapshot(docsQuery, snap => { allDocuments = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderFolders(); updateSummary(); });
        onSnapshot(paymentsQuery, snap => { allPayments = snap.docs.map(d => ({ id: d.id, ...d.data() })); updateNotifications(allPayments, allTenants); });

    } catch (error) {
        console.error("Error initializing page:", error);
        window.showToast("Could not load initial data.", "error");
    }
};
init();

elements.addDocBtn.addEventListener('click', () => elements.addDocModal.classList.remove('hidden'));
elements.cancelAddBtn.addEventListener('click', () => elements.addDocModal.classList.add('hidden'));
elements.searchInput.addEventListener('input', renderFolders);

elements.saveDocBtn.addEventListener('click', () => elements.addDocForm.requestSubmit());
elements.addDocForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target).entries());
    const dataToSave = { ...formData, uploadDate: Timestamp.now() };
    try {
        await addDoc(collection(db, "documents"), dataToSave);
        window.showToast('Document link saved successfully!');
        elements.addDocForm.reset();
        elements.addDocModal.classList.add('hidden');
    } catch (error) {
        console.error("Error saving document link: ", error);
        window.showToast('Could not save document link.', 'error');
    }
});

elements.folderView.addEventListener('click', (e) => {
    const folder = e.target.closest('.folder-item');
    if (folder) { renderTable(folder.dataset.id, folder.dataset.name); }
});

elements.docsTableBody.addEventListener('click', (e) => {
    const button = e.target.closest('.delete-doc-btn');
    if (button) {
        const docId = button.dataset.id;
        window.showConfirmModal('Delete Document Link', 'Are you sure? This will not delete the file from Google Drive.', async () => {
            try {
                await deleteDoc(doc(db, "documents", docId));
                window.showToast('Link deleted successfully.');
            } catch (err) {
                console.error(err);
                window.showToast('Could not delete link.', 'error');
            }
        });
    }
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