// tenants.js

import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc, Timestamp, getDocs, query, where, orderBy, getDoc, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

lucide.createIcons();

const elements = {
    tenantTableBody: document.getElementById('tenant-table-body'),
    tableHead: document.getElementById('table-head'),
    addTenantBtn: document.getElementById('add-tenant-btn'),
    tenantModal: document.getElementById('tenant-modal'),
    modalTitle: document.getElementById('modal-title'),
    cancelTenantBtn: document.getElementById('cancel-tenant-btn'),
    saveTenantBtn: document.getElementById('save-tenant-btn'),
    tenantForm: document.getElementById('tenant-form'),
    detailsModal: document.getElementById('details-modal'),
    closeDetailsBtn: document.getElementById('close-details-btn'),
    detailsModalBody: document.getElementById('details-modal-body'),
    searchInput: document.getElementById('search-input'),
    statusFilter: document.getElementById('status-filter'),
    currentTenantsTab: document.getElementById('current-tenants-tab'),
    pastTenantsTab: document.getElementById('past-tenants-tab'),
    tableTitle: document.getElementById('table-title'),
    totalTenants: document.getElementById('total-tenants'),
    occupiedProperties: document.getElementById('occupied-properties'),
    vacantProperties: document.getElementById('vacant-properties'),
    propertyIdSelect: document.getElementById('propertyId'),
    paginationControls: document.getElementById('pagination-controls'),
    imagePreview: document.getElementById('image-preview'),
    createLoginCheckbox: document.getElementById('create-login-checkbox'),
    uidFieldContainer: document.getElementById('uid-field-container'),
    createLoginContainer: document.getElementById('create-login-container'),
    emailInput: document.getElementById('email'),
    notificationBtn: document.getElementById('notification-btn'),
    activityModal: document.getElementById('activity-modal'),
    closeActivityModalBtn: document.getElementById('close-activity-modal'),
};
let allTenants = [], allProperties = [], allPayments = [], reminderTemplates = {}, paymentRules = {};
let currentView = 'current', editingTenantId = null;
let currentPage = 1, rowsPerPage = 10;

// --- Helper Functions ---

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

// --- Data Processing and Business Logic ---

const checkAndUpdateTenantStatus = (tenant) => {
    let tenantData = { ...tenant };
    let wasUpdated = false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!tenantData.dueDate || !tenantData.dueDate.seconds) {
        return { updatedTenant: tenantData, wasUpdated };
    }

    const dueDate = new Date(tenantData.dueDate.seconds * 1000);
    dueDate.setHours(0, 0, 0, 0);

    const windowOpenDate = new Date(dueDate);
    windowOpenDate.setDate(dueDate.getDate() - (paymentRules.paymentWindowDaysBefore || 6));

    let newStatus = tenantData.status;

    if (newStatus === 'Paid' && today >= windowOpenDate) {
        newStatus = 'Due';
    } else if (newStatus === 'Due' && today >= dueDate) {
        newStatus = 'Overdue';
    }

    if (tenantData.status !== newStatus) {
        tenantData.status = newStatus;
        wasUpdated = true;
    }
    
    return { updatedTenant: tenantData, wasUpdated };
};

const checkAndUpdateRent = (tenant) => {
    let tenantData = JSON.parse(JSON.stringify(tenant));
    let wasUpdated = false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!tenantData.rentIncrementDate || !tenantData.rentIncrementDate.seconds || !tenantData.increment) {
        return { updatedTenant: tenant, wasUpdated: false };
    }

    if (!tenantData.rentHistory || !Array.isArray(tenantData.rentHistory)) {
        tenantData.rentHistory = [];
    }
    
    const incrementAnniversary = new Date(tenantData.rentIncrementDate.seconds * 1000);
    
    let lastIncrementDate = (tenantData.rentHistory.length > 0)
        ? new Date(tenantData.rentHistory.slice().sort((a,b) => b.dateApplied.seconds - a.dateApplied.seconds)[0].dateApplied.seconds * 1000)
        : incrementAnniversary;

    let nextIncrementYear = lastIncrementDate.getFullYear();
    
    if (lastIncrementDate.getMonth() > incrementAnniversary.getMonth() || (lastIncrementDate.getMonth() === incrementAnniversary.getMonth() && lastIncrementDate.getDate() >= incrementAnniversary.getDate())) {
         nextIncrementYear += 1;
    }

    let nextIncrementDate = new Date(nextIncrementYear, incrementAnniversary.getMonth(), incrementAnniversary.getDate());

    while (today >= nextIncrementDate) {
        const newRent = Math.round(tenantData.rent + (tenantData.rent * (tenantData.increment / 100)));
        tenantData.rent = newRent;
        
        tenantData.rentHistory.push({
            year: tenantData.rentHistory.length + 1,
            rent: newRent,
            incrementPercent: tenantData.increment,
            dateApplied: Timestamp.fromDate(nextIncrementDate)
        });
        wasUpdated = true;
        
        nextIncrementYear++;
        nextIncrementDate.setFullYear(nextIncrementYear);
    }
    return { updatedTenant: tenantData, wasUpdated };
};

// --- UI Rendering ---

const getStatusBadge = (status, depositStatus = 'Pending') => {
    const rentBadges = { 'Paid': 'bg-green-100 text-green-700', 'Due': 'bg-yellow-100 text-yellow-700', 'Overdue': 'bg-red-100 text-red-700', 'Archived': 'bg-gray-100 text-gray-700' };
    const depositBadges = {'Paid': 'bg-blue-100 text-blue-700', 'Pending': 'bg-gray-200 text-gray-800', 'Refunded': 'bg-purple-100 text-purple-700' };

    let html = `<span class="text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full ${rentBadges[status] || ''}">${status}</span>`;
    if (status !== 'Archived') {
        html += `<span class="text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full ${depositBadges[depositStatus] || ''}">Deposit: ${depositStatus}</span>`;
    }
    return html;
};

const renderPaginationControls = (totalItems, totalPages) => {
    if (totalPages <= 1) {
        elements.paginationControls.innerHTML = '';
        return;
    }
    const startItem = (currentPage - 1) * rowsPerPage + 1;
    const endItem = Math.min(currentPage * rowsPerPage, totalItems);
    elements.paginationControls.innerHTML = `
        <div class="text-gray-600">Showing <span class="font-medium">${startItem}-${endItem}</span> of <span class="font-medium">${totalItems}</span></div>
        <div class="flex items-center gap-2">
            <button data-nav="prev" class="pagination-btn px-3 py-1 border rounded-md">Prev</button>
            <button data-nav="next" class="pagination-btn px-3 py-1 border rounded-md">Next</button>
        </div>`;
};

const renderTable = () => {
    elements.tableHead.innerHTML = `<tr><th class="p-4 font-semibold">Tenant</th><th class="p-4 font-semibold">Property</th><th class="p-4 font-semibold text-right">Rent (₹)</th><th class="p-4 font-semibold">Status</th><th class="p-4 font-semibold text-center">Actions</th></tr>`;
    const searchTerm = elements.searchInput.value.toLowerCase();
    const filterValue = elements.statusFilter.value;
    const tenantsToDisplay = allTenants.filter(t => (currentView === 'current' ? t.status !== 'Archived' : t.status === 'Archived')).sort((a, b) => a.name.localeCompare(b.name));
    const filteredTenants = tenantsToDisplay.filter(t => {
        const propName = (allProperties.find(p => p.id === t.propertyId) || {}).name || '';
        return (t.name.toLowerCase().includes(searchTerm) || (t.phone && t.phone.includes(searchTerm)) || (t.email && t.email.toLowerCase().includes(searchTerm)) || propName.toLowerCase().includes(searchTerm)) && (filterValue === 'all' || t.status === filterValue);
    });
    
    const totalPages = Math.max(1, Math.ceil(filteredTenants.length / rowsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const paginatedTenants = filteredTenants.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    elements.tenantTableBody.innerHTML = paginatedTenants.length === 0 ? `<tr><td colspan="5" class="p-4 text-center text-gray-500">No tenants found.</td></tr>` : paginatedTenants.map(tenant => {
        const property = allProperties.find(p => p.id === tenant.propertyId);
        const placeholderImg = `https://placehold.co/40x40/e0e7ff/4f46e5?text=${tenant.name.charAt(0)}`;
        return `
            <tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="p-4"><div class="flex items-center"><img src="${tenant.imageUrl || placeholderImg}" alt="Avatar" class="w-10 h-10 rounded-full mr-4 object-cover"><div class="font-semibold">${tenant.name}<span class="block text-xs font-normal text-gray-500">${tenant.email || ''}</span></div></div></td>
                <td class="p-4">${property ? property.name : 'N/A'}</td>
                <td class="p-4 text-right font-bold">₹${(tenant.rent || 0).toLocaleString('en-IN')}</td>
                <td class="p-4">${getStatusBadge(tenant.status, tenant.depositStatus)}</td>
                <td class="p-4 text-center space-x-2">
                    <button data-id="${tenant.id}" class="whatsapp-reminder-btn inline-flex items-center text-sm font-medium text-green-600 hover:text-green-800" title="Send Reminder"><i data-lucide="message-circle" class="w-4 h-4 mr-1"></i>Remind</button>
                    <button data-id="${tenant.id}" class="view-details-btn inline-flex items-center text-sm font-medium hover:brightness-90" style="color: var(--theme-color);" title="View Details"><i data-lucide="eye" class="w-4 h-4 mr-1"></i>View</button>
                </td>
            </tr>`;
    }).join('');
    
    renderPaginationControls(filteredTenants.length, totalPages);
    lucide.createIcons();
};

const updateSummary = () => {
    const currentTenants = allTenants.filter(t => t.status !== 'Archived');
    animateCounter(elements.totalTenants, currentTenants.length);
    const occupiedPropertyIds = new Set(currentTenants.map(t => t.propertyId));
    animateCounter(elements.occupiedProperties, occupiedPropertyIds.size);
    animateCounter(elements.vacantProperties, allProperties.length - occupiedPropertyIds.size);
};

// --- Modal Handling ---

const openTenantModal = (tenantId = null) => {
    elements.tenantForm.reset();
    document.getElementById('family-members-list').innerHTML = '';
    elements.imagePreview.src = "https://placehold.co/200x200/e0e7ff/4f46e5?text=Preview";
    
    const occupiedPropertyIds = allTenants.filter(t => t.status !== 'Archived' && t.id !== tenantId).map(t => t.propertyId);
    const vacantProperties = allProperties.filter(p => !occupiedPropertyIds.includes(p.id));
    elements.propertyIdSelect.innerHTML = '<option value="">Select a property</option>' + vacantProperties.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    
    document.getElementById('tenant-image-url').value = '';
    if (tenantId) {
        editingTenantId = tenantId;
        const tenant = allTenants.find(t => t.id === tenantId);
        elements.modalTitle.textContent = 'Edit Tenant Details';
        elements.createLoginContainer.style.display = 'none';
        elements.uidFieldContainer.style.display = 'none';
        elements.emailInput.readOnly = true;

        document.getElementById('tenant-image-url').value = tenant.imageUrl || '';
        if (tenant.imageUrl) elements.imagePreview.src = tenant.imageUrl;

        if (tenant.familyMembers && Array.isArray(tenant.familyMembers)) {
            tenant.familyMembers.forEach(member => addFamilyMemberRow(member.name, member.aadhar));
        }

        ['name','email','phone','aadharNumber','address','propertyId','rent','deposit','rentDueDay','increment','notes', 'depositStatus'].forEach(key => {
            if(elements.tenantForm.elements[key] && tenant[key]) {
                 elements.tenantForm.elements[key].value = tenant[key];
            }
        });
        ['agreementDate', 'agreementEndDate', 'rentIncrementDate'].forEach(key => {
            if (tenant[key] && tenant[key].seconds) {
                elements.tenantForm.elements[key].value = new Date(tenant[key].seconds * 1000).toISOString().split('T')[0];
            }
        });
        elements.saveTenantBtn.textContent = 'Update Tenant';
    } else {
        editingTenantId = null;
        elements.modalTitle.textContent = 'Add New Tenant';
        elements.createLoginContainer.style.display = 'block';
        elements.createLoginCheckbox.checked = false;
        elements.uidFieldContainer.style.display = 'none';
        elements.emailInput.readOnly = false;
        elements.saveTenantBtn.textContent = 'Save Tenant';
    }
    elements.tenantModal.classList.remove('hidden');
};

const addFamilyMemberRow = (name = '', aadhar = '') => {
    const list = document.getElementById('family-members-list');
    const row = document.createElement('div');
    row.className = 'flex items-center space-x-2';
    row.innerHTML = `
        <input type="text" name="memberName" placeholder="Member Name" class="w-1/2 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" value="${name}">
        <input type="text" name="memberAadhar" placeholder="Aadhar No." class="w-1/2 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" value="${aadhar}">
        <button type="button" class="remove-member-btn text-red-500 hover:text-red-700 p-1">
            <i data-lucide="x-circle" class="w-4 h-4"></i>
        </button>
    `;
    list.appendChild(row);
    lucide.createIcons();
};

const closeTenantModal = () => elements.tenantModal.classList.add('hidden');

const openDetailsModal = (tenantId) => {
    elements.detailsModalBody.innerHTML = `<div class="text-center p-8"><div class="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full mx-auto"></div><p class="mt-4 text-gray-500">Loading tenant details...</p></div>`;
    elements.detailsModal.classList.remove('hidden');
    populateDetailsTabs(tenantId);
};

const populateDetailsTabs = async (tenantId) => {
    try {
        const tenant = allTenants.find(t => t.id === tenantId);
        const property = allProperties.find(p => p.id === tenant.propertyId);
        const placeholderImg = `https://placehold.co/150x150/e0e7ff/4f46e5?text=${tenant.name.charAt(0)}`;

        const startDate = tenant.agreementDate ? new Date(tenant.agreementDate.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
        const endDateRaw = tenant.agreementEndDate;
        const endDate = endDateRaw ? (endDateRaw.seconds ? new Date(endDateRaw.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date(endDateRaw).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })) : 'N/A';
        const startingRent = (tenant.rentHistory && tenant.rentHistory.length > 0) ? tenant.rentHistory[0].rent : tenant.rent;

        const familyMembersHtml = (tenant.familyMembers && Array.isArray(tenant.familyMembers) && tenant.familyMembers.length > 0)
            ? `<ul class="list-disc list-inside space-y-1">${tenant.familyMembers.map(m => `<li><span class="font-semibold">${m.name}</span>${m.aadhar ? ` <span class="text-xs text-gray-500">(Aadhar: ${m.aadhar})</span>` : ''}</li>`).join('')}</ul>`
            : '<p class="font-semibold">N/A</p>';

        const historyTableHtml = (tenant.rentHistory && tenant.rentHistory.length > 1) ? `
            <div class="overflow-x-auto mt-4"><table class="w-full text-sm text-left">
                <thead class="bg-gray-50"><tr><th class="p-2 font-semibold">Year</th><th class="p-2 font-semibold text-right">Rent (₹)</th><th class="p-2 font-semibold text-right">Increment</th><th class="p-2 font-semibold">Date Applied</th></tr></thead>
                <tbody>${tenant.rentHistory.slice().reverse().map(e => `<tr class="border-b"><td class="p-2">${e.year}</td><td class="p-2 font-semibold text-right">₹${e.rent.toLocaleString('en-IN')}</td><td class="p-2 text-right">${e.incrementPercent}%</td><td class="p-2">${new Date(e.dateApplied.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>`).join('')}</tbody>
            </table></div>` : '<p class="text-sm text-gray-500 mt-2">No rent increment history found.</p>';
        
        const notesHtml = tenant.notes ? `<div class="prose prose-sm max-w-none whitespace-pre-wrap p-4 bg-gray-50 rounded-lg">${tenant.notes}</div>` : '<p class="text-sm text-gray-500">No admin notes for this tenant.</p>';

        const paymentsQuery = query(collection(db, "payments"), where("tenantId", "==", tenant.id), orderBy("date", "desc"));
        const paymentDocs = await getDocs(paymentsQuery);
        const paymentsHtml = paymentDocs.empty ? `<p class="text-center p-4 text-gray-500">No payments found.</p>` : `
            <div class="overflow-x-auto"><table class="w-full text-sm text-left">
                <thead class="bg-gray-50"><tr><th class="p-2 font-semibold">Date</th><th class="p-2 font-semibold">Mode</th><th class="p-2 font-semibold text-right">Amount (₹)</th></tr></thead>
                <tbody>${paymentDocs.docs.map(d => { const p = d.data(); return `<tr class="border-b"><td class="p-2">${new Date(p.date.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td><td class="p-2">${p.paymentMode}</td><td class="p-2 font-semibold text-right">₹${p.amount.toLocaleString('en-IN')}</td></tr>`}).join('')}</tbody>
            </table></div>`;
        
        const depositStatusInfo = `<div class="flex justify-between"><span class="text-gray-500">Security Deposit</span><span class="font-semibold">₹${(tenant.deposit || 0).toLocaleString('en-IN')} (${tenant.depositStatus || 'Pending'})</span></div>`;
        
        elements.detailsModalBody.innerHTML = `
            <div class="flex flex-col md:flex-row items-start md:space-x-8">
                <div class="w-full md:w-1/4 text-center md:border-r md:pr-8 flex-shrink-0">
                    <img src="${tenant.imageUrl || placeholderImg}" class="w-32 h-32 rounded-full mx-auto object-cover border-4 border-white shadow-lg">
                    <h3 class="text-2xl font-bold mt-4">${tenant.name}</h3>
                    <p class="text-gray-500">${property ? property.name : 'N/A'}</p>
                    <div class="mt-2">${getStatusBadge(tenant.status, tenant.depositStatus)}</div>
                    <div class="mt-4 flex flex-col space-y-2">
                        <button data-id="${tenant.id}" id="edit-tenant-details-btn" class="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg w-full">Edit</button>
                        ${tenant.status !== 'Archived' ? `<button data-id="${tenant.id}" id="archive-tenant-btn" class="bg-orange-100 text-orange-700 font-semibold py-2 px-4 rounded-lg w-full">Move to Past Tenants</button>` : `<button data-id="${tenant.id}" id="delete-tenant-btn" class="bg-red-100 text-red-700 font-semibold py-2 px-4 rounded-lg w-full">Delete</button>`}
                    </div>
                    </div>
                <div class="w-full md:w-3/4 mt-6 md:mt-0">
                    <div class="border-b border-gray-200"><nav class="flex space-x-4 -mb-px" id="details-tab-nav">
                        <button data-tab="details" class="details-tab py-2 px-1 border-b-2 font-medium text-sm details-tab-active">Details</button>
                        <button data-tab="payments" class="details-tab py-2 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700">Payment History</button>
                        <button data-tab="rent-history" class="details-tab py-2 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700">Rent Increment History</button>
                        <button data-tab="notes" class="details-tab py-2 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700">Notes</button>
                    </nav></div>
                    <div class="mt-4">
                        <div id="tab-details" class="details-tab-content active"></div>
                        <div id="tab-payments" class="details-tab-content">${paymentsHtml}</div>
                        <div id="tab-rent-history" class="details-tab-content">${historyTableHtml}</div>
                        <div id="tab-notes" class="details-tab-content">${notesHtml}</div>
                    </div>
                </div>
            </div>`;

        document.getElementById('tab-details').innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
            <div>
                <h4 class="font-bold text-lg mb-4">Agreement & Financials</h4>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between"><span class="text-gray-500">Agreement Start</span><span class="font-semibold">${startDate}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">Agreement End</span><span class="font-semibold">${endDate}</span></div><hr>
                    <div class="flex justify-between"><span class="text-gray-500">Starting Rent</span><span class="font-semibold">₹${startingRent.toLocaleString('en-IN')}</span></div>
                    <div class="flex justify-between text-green-600"><span class="text-gray-500">Current Rent</span><span class="font-bold text-base">₹${tenant.rent.toLocaleString('en-IN')}</span></div>
                    ${depositStatusInfo}
                    <div class="flex justify-between"><span class="text-gray-500">Yearly Increment</span><span class="font-semibold">${tenant.increment}%</span></div>
                    <div class="flex justify-between items-center mt-2">
                        <span class="text-gray-500">Next Increment Due</span>
                        <button data-id="${tenant.id}" id="apply-increment-btn" class="text-white font-semibold py-1 px-3 text-xs rounded-md hover:brightness-110" style="background-color: var(--theme-color);">Apply ${tenant.increment}% Increment</button>
                    </div>
                </div>
            </div>
            <div>
                <h4 class="font-bold text-lg mb-4">Personal Details</h4>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between"><span class="text-gray-500">Email</span><span class="font-semibold">${tenant.email || 'N/A'}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">Phone</span><a href="tel:${tenant.phone}" class="font-semibold hover:underline" style="color: var(--theme-color);">${tenant.phone || 'N/A'}</a></div>
                    <div class="flex justify-between"><span class="text-gray-500">Aadhar</span><span class="font-semibold">${tenant.aadharNumber || 'N/A'}</span></div>
                    <div><p class="text-gray-500 mb-1">Address</p><p class="font-semibold whitespace-pre-wrap">${tenant.address || 'N/A'}</p></div>
                    <div><p class="text-gray-500 mb-1">Family Members</p>${familyMembersHtml}</div>
                </div>
            </div>
        </div>`;

        lucide.createIcons();

        document.getElementById('details-tab-nav').addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') return;
            document.querySelectorAll('.details-tab').forEach(tab => tab.classList.remove('details-tab-active'));
            document.querySelectorAll('.details-tab-content').forEach(content => content.classList.remove('active'));
            
            e.target.classList.add('details-tab-active');
            
            const tabId = `tab-${e.target.dataset.tab}`;
            document.getElementById(tabId).classList.add('active');
        });

    } catch (error) {
        console.error("Error populating details modal:", error);
        elements.detailsModalBody.innerHTML = `<div class="p-8 text-center text-red-500">Could not load tenant details. Please check the developer console for errors.</div>`;
    }
};

const closeDetailsModal = () => elements.detailsModal.classList.add('hidden');

const manuallyApplyIncrement = async (tenantId) => {
    const tenant = allTenants.find(t => t.id === tenantId);
    if (!tenant) return window.showToast('Tenant not found.', 'error');

    const incrementPercent = tenant.increment || 10;
    const newRent = Math.round(tenant.rent + (tenant.rent * (incrementPercent / 100)));

    const newHistoryEntry = {
        year: (tenant.rentHistory?.length || 0) + 1,
        rent: newRent,
        incrementPercent: incrementPercent,
        dateApplied: Timestamp.now()
    };

    const rentHistory = tenant.rentHistory ? [...tenant.rentHistory, newHistoryEntry] : [newHistoryEntry];

    try {
        await setDoc(doc(db, "tenants", tenantId), {
            rent: newRent,
            rentHistory: rentHistory
        }, { merge: true });

        window.showToast(`Rent updated to ₹${newRent.toLocaleString('en-IN')}!`, 'success');

        // Refresh the details view to show the new rent
        populateDetailsTabs(tenantId);
    } catch (error) {
        console.error("Error applying increment:", error);
        window.showToast("Failed to apply increment.", 'error');
    }
};

// --- Actions ---

const sendWhatsAppReminder = (tenantId) => {
    const tenant = allTenants.find(t => t.id === tenantId);
    if (!tenant) return window.showToast('Tenant not found.', 'error');
    if (tenant.status === 'Paid') {
        window.showToast(`${tenant.name} has already paid.`, 'info');
        return;
    }
    const property = allProperties.find(p => p.id === tenant.propertyId);
    const firstName = tenant.name.split(' ')[0];
    const propertyName = property ? property.name : "Shekhawat Market";
    const rent = (tenant.rent || 0).toLocaleString('en-IN');
    const dueDate = tenant.dueDate ? new Date(tenant.dueDate.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the due date';
    
    let template = reminderTemplates.due || "Hi {firstName}, your rent of ₹{rent} for {propertyName} is due on {dueDate}.";
    if (tenant.status === 'Overdue') {
        template = reminderTemplates.overdue || "Hi {firstName}, your rent for {propertyName} is overdue. Please pay immediately.";
    }
    
    const message = template.replace(/{firstName}/g, firstName).replace(/{rent}/g, rent).replace(/{propertyName}/g, propertyName).replace(/{dueDate}/g, dueDate);

    const phone = tenant.phone;
    if (!phone) {
        window.showToast("This tenant does not have a phone number saved.", 'error');
        return;
    }
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
};

const saveTenant = async (e) => {
    e.preventDefault();
    const saveButton = elements.saveTenantBtn;
    saveButton.disabled = true;
    saveButton.innerHTML = `<div class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"></div>`;

    const formData = Object.fromEntries(new FormData(e.target).entries());

    if (editingTenantId) {
        // Logic for UPDATING an existing tenant
        try {
            const familyMembers = [];
            document.querySelectorAll('#family-members-list > div').forEach(row => {
                const name = row.querySelector('input[name="memberName"]').value.trim();
                const aadhar = row.querySelector('input[name="memberAadhar"]').value.trim();
                if (name) { familyMembers.push({ name, aadhar }); }
            });

            const dataToSave = {
                name: formData.name, email: formData.email, phone: formData.phone, aadharNumber: formData.aadharNumber,
                address: formData.address, familyMembers: familyMembers, propertyId: formData.propertyId,
                rent: parseInt(formData.rent) || 0, deposit: parseInt(formData.deposit) || 0,
                depositStatus: formData.depositStatus || 'Pending', rentDueDay: parseInt(formData.rentDueDay) || 5,
                increment: parseInt(formData.increment) || 10, notes: formData.notes || '',
                rentIncrementDate: formData.rentIncrementDate ? Timestamp.fromDate(new Date(formData.rentIncrementDate)) : null,
                agreementDate: formData.agreementDate ? Timestamp.fromDate(new Date(formData.agreementDate)) : null,
                agreementEndDate: formData.agreementEndDate ? Timestamp.fromDate(new Date(formData.agreementEndDate)) : null,
                imageUrl: formData.imageUrl || ''
            };

            await setDoc(doc(db, "tenants", editingTenantId), dataToSave, { merge: true });
            window.showToast('Tenant updated successfully!');
            closeTenantModal();
        } catch(error) {
            console.error("Error updating tenant:", error);
            window.showToast("Could not update tenant.", 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Update Tenant';
        }
    } else {
        // Logic for CREATING a new tenant
        try {
            const createLogin = elements.createLoginCheckbox.checked;
            const tenantUid = formData.tenantUid?.trim();

            if (createLogin) {
                if (!tenantUid) throw new Error("Firebase UID is required when 'Create Login' is checked.");
                if (!formData.email) throw new Error("Email is required when 'Create Login' is checked.");
            }

            const familyMembers = [];
            document.querySelectorAll('#family-members-list > div').forEach(row => {
                const name = row.querySelector('input[name="memberName"]').value.trim();
                const aadhar = row.querySelector('input[name="memberAadhar"]').value.trim();
                if (name) { familyMembers.push({ name, aadhar }); }
            });

            const rentDueDay = parseInt(formData.rentDueDay) || 5;
            const today = new Date();
            // Set the initial due date based on the CURRENT month and year
            let newDueDate = new Date(today.getFullYear(), today.getMonth(), rentDueDay);

            // If the due day has already passed in the current month, set the due date for NEXT month
            if (today.getDate() > rentDueDay) {
                newDueDate.setMonth(newDueDate.getMonth() + 1);
            }

            const tenantData = {
                name: formData.name, phone: formData.phone, aadharNumber: formData.aadharNumber,
                address: formData.address, familyMembers: familyMembers, propertyId: formData.propertyId,
                rent: parseInt(formData.rent) || 0, deposit: parseInt(formData.deposit) || 0,
                depositStatus: formData.depositStatus || 'Pending', rentDueDay: rentDueDay,
                increment: parseInt(formData.increment) || 10, notes: formData.notes || '',
                rentIncrementDate: formData.rentIncrementDate ? Timestamp.fromDate(new Date(formData.rentIncrementDate)) : null,
                agreementDate: formData.agreementDate ? Timestamp.fromDate(new Date(formData.agreementDate)) : null,
                agreementEndDate: formData.agreementEndDate ? Timestamp.fromDate(new Date(formData.agreementEndDate)) : null,
                dueDate: Timestamp.fromDate(newDueDate),
                email: formData.email || null,
                imageUrl: formData.imageUrl || '',
                status: 'Due',
                createdAt: Timestamp.now()
            };

            if (tenantUid) {
                await setDoc(doc(db, "tenants", tenantUid), tenantData);
                window.showToast('Tenant with login created successfully!');
            } else {
                await addDoc(collection(db, "tenants"), tenantData);
                window.showToast('Tenant added successfully (no login).');
            }
            
            closeTenantModal();

        } catch (error) {
            console.error("Error creating tenant:", error);
            window.showToast(error.message || "Failed to create tenant.", 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Tenant';
        }
    }
};

// --- Initialization and Event Listeners ---

const init = async () => {
    try {
        const [reminderTemplatesSnap, paymentRulesSnap] = await Promise.all([
            getDoc(doc(db, "settings", "reminderMessages")),
            getDoc(doc(db, "settings", "paymentRules"))
        ]);
        if (reminderTemplatesSnap.exists()) reminderTemplates = reminderTemplatesSnap.data();
        if (paymentRulesSnap.exists()) paymentRules = paymentRulesSnap.data();
        
        onSnapshot(doc(db, "settings", "reminderMessages"), docSnap => {
            if (docSnap.exists()) reminderTemplates = docSnap.data();
        });

        onSnapshot(doc(db, "settings", "paymentRules"), docSnap => {
            if (docSnap.exists()) paymentRules = docSnap.data();
        });
    } catch (error) {
        console.error("Error fetching settings:", error);
    }

    onSnapshot(collection(db, "properties"), snap => {
        allProperties = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable(); 
    });
    
    onSnapshot(collection(db, "tenants"), async (snapshot) => {
        const updatePromises = [];
        let tenantsFromDB = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        for (let i = 0; i < tenantsFromDB.length; i++) {
            let tenant = tenantsFromDB[i];
            if (tenant.status !== 'Archived') {
                const statusCheck = checkAndUpdateTenantStatus(tenant);
                if (statusCheck.wasUpdated) tenant = statusCheck.updatedTenant;

                // const rentCheck = checkAndUpdateRent(tenant);
                // if (rentCheck.wasUpdated) tenant = rentCheck.updatedTenant;

                if (statusCheck.wasUpdated) { // Now it only checks for status updates
                    updatePromises.push(setDoc(doc(db, "tenants", tenant.id), tenant));
                }
            }
        }

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        } else {
            allTenants = tenantsFromDB;
            updateSummary();
            renderTable();
        }
    });
    
    onSnapshot(query(collection(db, "payments"), orderBy("date", "desc")), (snap) => {
        allPayments = snap.docs.map(d => ({id: d.id, ...d.data()}));
        // This function is also a candidate for shared-admin.js
        updateNotifications(allPayments, allTenants);
    });
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

elements.addTenantBtn.addEventListener('click', () => openTenantModal());
elements.cancelTenantBtn.addEventListener('click', closeTenantModal);
elements.closeDetailsBtn.addEventListener('click', closeDetailsModal);

const imageUrlInput = document.getElementById('tenant-image-url');
imageUrlInput.addEventListener('input', () => {
    const defaultImg = "https://placehold.co/200x200/e0e7ff/4f46e5?text=Preview";
    const newUrl = imageUrlInput.value;
    elements.imagePreview.src = (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) ? newUrl : defaultImg;
});

elements.createLoginCheckbox.addEventListener('change', () => {
    const isChecked = elements.createLoginCheckbox.checked;
    elements.uidFieldContainer.style.display = isChecked ? 'block' : 'none';
    elements.emailInput.required = isChecked;
});

elements.saveTenantBtn.addEventListener('click', () => elements.tenantForm.requestSubmit());
elements.tenantForm.addEventListener('submit', saveTenant);

elements.detailsModalBody.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const tenantId = button.dataset.id;
    const tenant = allTenants.find(t => t.id === tenantId);
    
    if (button.id === 'edit-tenant-details-btn' && tenantId) { 
        closeDetailsModal(); 
        openTenantModal(tenantId); 
    } else if (button.id === 'archive-tenant-btn' && tenantId) {
        window.showConfirmModal('Move to Past Tenants?', `Are you sure you want to move <strong>${tenant.name}</strong> to Past Tenants?`, async () => {
            await setDoc(doc(db, "tenants", tenantId), { status: 'Archived', archivedDate: Timestamp.now() }, { merge: true });
            closeDetailsModal();
        });
    } else if (button.id === 'delete-tenant-btn' && tenantId) {
        window.showConfirmModal('Delete Permanently', `This will delete all data for <strong>${tenant.name}</strong>. This action cannot be undone.`, async () => {
            await deleteDoc(doc(db, "tenants", tenantId));
            closeDetailsModal();
        });
    } else if (button.id === 'apply-increment-btn' && tenantId) {
        window.showConfirmModal(
            'Apply Rent Increment?', 
            `This will increase the rent for <strong>${tenant.name}</strong> by ${tenant.increment}%. Are you sure?`, 
            () => manuallyApplyIncrement(tenantId)
        );
    }
});

elements.tenantTableBody.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.classList.contains('view-details-btn')) { openDetailsModal(button.dataset.id); }
    if (button.classList.contains('whatsapp-reminder-btn')) { sendWhatsAppReminder(button.dataset.id); }
});

document.getElementById('add-family-member-btn').addEventListener('click', () => addFamilyMemberRow());
document.getElementById('family-members-list').addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.remove-member-btn');
    if (removeBtn) {
        removeBtn.parentElement.remove();
    }
});

elements.paginationControls.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const nav = btn.dataset.nav;
    const totalItems = allTenants.filter(t => (currentView === 'current' ? t.status !== 'Archived' : t.status === 'Archived')).length;
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    if (nav === 'prev' && currentPage > 1) currentPage--;
    else if (nav === 'next' && currentPage < totalPages) currentPage++;
    renderTable();
});

elements.searchInput.addEventListener('input', () => { currentPage = 1; renderTable(); });
elements.statusFilter.addEventListener('change', () => { currentPage = 1; renderTable(); });

const setActiveTab = (activeTab) => {
    const inactiveTab = activeTab === elements.currentTenantsTab ? elements.pastTenantsTab : elements.currentTenantsTab;
    activeTab.classList.add('tab-active');
    activeTab.classList.remove('border-transparent', 'text-gray-500');
    inactiveTab.classList.remove('tab-active');
    inactiveTab.classList.add('border-transparent', 'text-gray-500');
};
elements.currentTenantsTab.addEventListener('click', () => { if (currentView === 'current') return; currentPage = 1; currentView = 'current'; elements.tableTitle.textContent = 'Current Tenants'; elements.statusFilter.style.display = 'block'; setActiveTab(elements.currentTenantsTab); renderTable(); });
elements.pastTenantsTab.addEventListener('click', () => { if (currentView === 'past') return; currentPage = 1; currentView = 'past'; elements.tableTitle.textContent = 'Past Tenants'; elements.statusFilter.style.display = 'none'; setActiveTab(elements.pastTenantsTab); renderTable(); });

elements.notificationBtn.addEventListener('click', () => {
    elements.activityModal.classList.remove('hidden');
    if (allPayments.length > 0) {
        const latestTimestamp = allPayments[0].date.seconds * 1000;
        localStorage.setItem('lastReadTimestamp', latestTimestamp);
        updateNotifications(allPayments, allTenants);
    }
});
elements.closeActivityModalBtn.addEventListener('click', () => elements.activityModal.classList.add('hidden'));

init();
