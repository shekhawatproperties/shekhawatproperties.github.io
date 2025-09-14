// payments.js

import { db } from './firebase-config.js';
import { collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, Timestamp, getDoc, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

lucide.createIcons();

const elements = {
    paymentTableBody: document.getElementById('payment-table-body'),
    verificationTableBody: document.getElementById('verification-table-body'),
    recordPaymentBtn: document.getElementById('record-payment-btn'),
    paymentModal: document.getElementById('payment-modal'),
    cancelPaymentBtn: document.getElementById('cancel-payment-btn'),
    savePaymentBtn: document.getElementById('save-payment-btn'),
    paymentForm: document.getElementById('payment-form'),
    searchInput: document.getElementById('search-input'),
    tenantSelect: document.getElementById('tenant-select'),
    propertyName: document.getElementById('property-name'),
    historyTab: document.getElementById('history-tab'),
    verificationTab: document.getElementById('verification-tab'),
    historyView: document.getElementById('history-view'),
    verificationView: document.getElementById('verification-view'),
    verificationCount: document.getElementById('verification-count'),
    monthCollection: document.getElementById('month-collection'),
    totalDue: document.getElementById('total-due'),
    totalOverdue: document.getElementById('total-overdue'),
    paginationControls: document.getElementById('pagination-controls'),
    confirmVerificationModal: document.getElementById('confirm-verification-modal'),
    promptModal: document.getElementById('prompt-modal'),
    promptForm: document.getElementById('prompt-form'),
    promptModalTitle: document.getElementById('prompt-modal-title'),
    promptModalInput: document.getElementById('prompt-modal-input'),
    cancelPromptBtn: document.getElementById('cancel-prompt-btn'),
    submitPromptBtn: document.getElementById('submit-prompt-btn'),
    notificationBtn: document.getElementById('notification-btn'),
    activityModal: document.getElementById('activity-modal'),
    closeActivityModalBtn: document.getElementById('close-activity-modal'),
};

let allTenants = [];
let allProperties = [];
let allPayments = [];
let allPendingPayments = [];
let editingPaymentId = null;
let currentPage = 1;
let currentPendingPaymentId = null;
let promptCallback = null;
const rowsPerPage = 10;

const formatDate = (ts) => ts ? new Date(ts.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
const openModal = (modal) => modal.classList.remove('hidden');
const closeModal = (modal) => modal.classList.add('hidden');
const formatTime = (timestamp) => timestamp ? new Date(timestamp.seconds * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
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

const animateCounter = (element, finalValue) => {
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

const setButtonLoading = (button, isLoading) => {
    if (isLoading) {
        button.disabled = true;
        if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
        const intervalId = setInterval(() => {
            const randomAmount = Math.floor(Math.random() * 25000);
            button.innerHTML = `Processing ₹${randomAmount.toLocaleString('en-IN')}`;
        }, 90);
        button.dataset.loadingInterval = intervalId;
    } else {
        clearInterval(button.dataset.loadingInterval);
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || 'Submit';
    }
};

const renderAll = () => {
    renderHistoryTable();
    renderVerificationTable();
};

const updateSummary = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthCollection = allPayments
        .filter(p => p.date && (p.date.seconds * 1000) >= startOfMonth.getTime())
        .reduce((sum, p) => sum + (p.amount || 0), 0);

    const dueTenants = allTenants.filter(t => t.status === 'Due' || t.status === 'Overdue');
    const totalDue = dueTenants.reduce((sum, t) => sum + (t.rent || 0), 0);

    const overdueTenants = allTenants.filter(t => t.status === 'Overdue');
    const totalOverdue = overdueTenants.reduce((sum, t) => sum + (t.rent || 0), 0);

    animateCounter(elements.monthCollection, thisMonthCollection);
    animateCounter(elements.totalDue, totalDue);
    animateCounter(elements.totalOverdue, totalOverdue);
};

function getNextDueDate(currentDueDate, rentDueDay) {
    const date = new Date(currentDueDate.seconds * 1000);
    const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, rentDueDay);
    if (nextDate.getMonth() !== (date.getMonth() + 1) % 12) {
        nextDate.setDate(0);
    }
    return nextDate;
}

const renderPaginationControls = (totalItems, totalPages) => {
    if (!elements.paginationControls) return;
    const start = (currentPage - 1) * rowsPerPage + 1;
    const end = Math.min(currentPage * rowsPerPage, totalItems);

    const pageButtons = Array.from({ length: totalPages }, (_, i) => {
        const pageNum = i + 1;
        return `<button data-page="${pageNum}" class="pagination-btn px-3 py-1 border rounded-md ${pageNum === currentPage ? 'active' : ''}">${pageNum}</button>`;
    }).join('');

    elements.paginationControls.innerHTML = `
        <div class="text-gray-600">Showing <span class="font-medium">${totalItems === 0 ? 0 : start}-${end}</span> of <span class="font-medium">${totalItems}</span></div>
        <div class="flex items-center gap-2">
            <button data-nav="prev" class="px-3 py-1 border rounded-md">Prev</button>
            ${pageButtons}
            <button data-nav="next" class="px-3 py-1 border rounded-md">Next</button>
        </div>
    `;
};

const renderHistoryTable = () => {
    const searchTerm = (elements.searchInput?.value || '').toLowerCase();
    const filteredPayments = allPayments.filter(p => {
        const tenant = allTenants.find(t => t.id === p.tenantId);
        const byName = tenant && tenant.name && tenant.name.toLowerCase().includes(searchTerm);
        const byId = p.id && p.id.toLowerCase().includes(searchTerm);
        return searchTerm ? (byName || byId) : true;
    });
    const totalPages = Math.max(1, Math.ceil(filteredPayments.length / rowsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const paginatedPayments = filteredPayments.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    elements.paymentTableBody.innerHTML = paginatedPayments.length === 0
        ? `<tr><td colspan="7" class="p-4 text-center text-gray-500">No transactions found.</td></tr>`
        : paginatedPayments.map(p => {
            const tenant = allTenants.find(t => t.id === p.tenantId) || {};
            const property = allProperties.find(prop => prop.id === tenant.propertyId) || {};
            return `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="p-4 text-xs text-gray-600">${p.id.substring(0,10)}...</td>
                    <td class="p-4">${formatDate(p.date)}</td>
                    <td class="p-4 font-semibold">${tenant.name || 'N/A'}</td>
                    <td class="p-4">${property.name || 'N/A'}</td>
                    <td class="p-4"><span class="bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-0.5 rounded-full">${p.paymentMode || 'N/A'}</span></td>
                    <td class="p-4 font-semibold text-right">₹${(p.amount || 0).toLocaleString('en-IN')}</td>
                    <td class="p-4 text-center space-x-2">
                        <a href="receipt.html?id=${p.id}" target="_blank" class="inline-block p-2 rounded-full hover:bg-gray-100" style="color: var(--theme-color);" title="View Receipt"><i data-lucide="receipt" class="w-5 h-5"></i></a>
                        <button data-id="${p.id}" class="edit-payment-btn p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="Edit Payment"><i data-lucide="edit" class="w-5 h-5 pointer-events-none"></i></button>
                        <button data-id="${p.id}" class="delete-payment-btn p-2 text-red-600 hover:bg-red-100 rounded-full" title="Delete Payment"><i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i></button>
                    </td>
                </tr>`;
        }).join('');

    renderPaginationControls(filteredPayments.length, totalPages);
    lucide.createIcons();
};

const renderVerificationTable = () => {
    elements.verificationTableBody.innerHTML = allPendingPayments.length === 0
        ? `<tr><td colspan="5" class="p-4 text-center text-gray-500">No pending payments.</td></tr>`
        : allPendingPayments.map(p => {
            const tenant = allTenants.find(t => t.id === p.tenantId) || {};
            const property = allProperties.find(prop => prop.id === tenant.propertyId) || {};
            return `
                <tr class="border-b border-gray-100">
                    <td class="p-4 text-sm">${formatDate(p.time)}<span class="block text-xs text-gray-500">${formatTime(p.time)}</span></td>
                    <td class="p-4 font-semibold">${tenant.name || 'N/A'}</td>
                    <td class="p-4">${property.name || 'N/A'}</td>
                    <td class="p-4 font-semibold text-right">₹${(p.amount || 0).toLocaleString('en-IN')}</td>
                    <td class="p-4 text-center space-x-2">
                        <button data-id="${p.id}" class="verify-btn bg-green-100 text-green-700 font-semibold py-1 px-3 rounded-lg text-sm">Verify</button>
                        <button data-id="${p.id}" class="reject-btn bg-red-100 text-red-700 font-semibold py-1 px-3 rounded-lg text-sm">Reject</button>
                    </td>
                </tr>`;
        }).join('');

    elements.verificationCount.textContent = allPendingPayments.length;
    elements.verificationCount.classList.toggle('hidden', allPendingPayments.length === 0);
};

const showPromptModal = (title, onConfirm) => {
    elements.promptModalTitle.textContent = title;
    elements.promptModalInput.value = '';
    promptCallback = onConfirm;
    openModal(elements.promptModal);
    setTimeout(() => elements.promptModalInput.focus(), 100);
};

const populateTenantSelect = () => {
    if (!elements.tenantSelect) return;
    elements.tenantSelect.innerHTML = '<option value="">Select a tenant</option>' + allTenants.filter(t=> t.status !== 'Archived').map(t => `<option value="${t.id}">${t.name}</option>`).join('');
};

const openPaymentModal = (paymentId = null) => {
    elements.paymentForm.reset();
    editingPaymentId = paymentId;
    populateTenantSelect();
    if (paymentId) {
        const payment = allPayments.find(p => p.id === paymentId);
        elements.paymentModal.querySelector('h2').textContent = 'Edit Payment';
        elements.savePaymentBtn.textContent = 'Update Payment';
        elements.tenantSelect.value = payment.tenantId;
        elements.tenantSelect.dispatchEvent(new Event('change'));
        document.getElementById('paymentDate').value = new Date(payment.date.seconds * 1000).toISOString().split('T')[0];
        document.getElementById('paymentMode').value = payment.paymentMode;
        document.getElementById('notes').value = payment.notes || '';
        const breakdown = payment.breakdown || {};
        document.getElementById('breakdown-rent').value = breakdown.rent || 0;
        document.getElementById('breakdown-electricity').value = breakdown.electricity || 0;
        document.getElementById('breakdown-latefee').value = breakdown.lateFee || 0;
        document.getElementById('breakdown-other').value = breakdown.other || 0;
        calculateTotal();
    } else {
        elements.paymentModal.querySelector('h2').textContent = 'Record a Payment';
        elements.savePaymentBtn.textContent = 'Save Payment';
        document.getElementById('paymentDate').valueAsDate = new Date();
    }
    openModal(elements.paymentModal);
};

const calculateTotal = () => {
    const rent = parseFloat(document.getElementById('breakdown-rent').value) || 0;
    const electricity = parseFloat(document.getElementById('breakdown-electricity').value) || 0;
    const latefee = parseFloat(document.getElementById('breakdown-latefee').value) || 0;
    const other = parseFloat(document.getElementById('breakdown-other').value) || 0;
    document.getElementById('amount').value = rent + electricity + latefee + other;
};

const openVerificationModal = async (pendingPayment) => {
    currentPendingPaymentId = pendingPayment.id;
    const tenant = allTenants.find(t => t.id === pendingPayment.tenantId) || {};
    const property = allProperties.find(p => p.id === tenant.propertyId) || {};
    document.getElementById('confirm-tenant').textContent = tenant.name || 'N/A';
    document.getElementById('confirm-property').textContent = property.name || 'N/A';
    document.getElementById('confirm-date').textContent = formatDate(pendingPayment.time);
    document.getElementById('confirm-v-total').textContent = `₹${(pendingPayment.amount || 0).toLocaleString('en-IN')}`;
    const chargesRef = collection(db, "tenants", pendingPayment.tenantId, "monthly_charges");
    const unbilledQuery = query(chargesRef, where("isBilled", "==", false));
    const unbilledSnaps = await getDocs(unbilledQuery);
    let electricity = 0, other = 0;
    unbilledSnaps.forEach(doc => {
        const charge = doc.data();
        electricity += charge.electricityBill || 0;
        other += charge.otherCharges || 0;
    });
    const rent = pendingPayment.amount - electricity - other;
    document.getElementById('confirm-v-rent').textContent = `₹${rent.toLocaleString('en-IN')}`;
    document.getElementById('confirm-v-electricity').textContent = `₹${electricity.toLocaleString('en-IN')}`;
    document.getElementById('confirm-v-other').textContent = `₹${other.toLocaleString('en-IN')}`;
    openModal(elements.confirmVerificationModal);
};

const initApp = async () => {
    lucide.createIcons();
    const minDelayPromise = new Promise(resolve => setTimeout(resolve, 1500));
    
    const fetchAllData = async () => {
        const [tenantsSnap, propertiesSnap, paymentsSnap, pendingSnap] = await Promise.all([
            getDocs(collection(db, "tenants")),
            getDocs(collection(db, "properties")),
            getDocs(query(collection(db, "payments"), orderBy("date", "desc"))),
            getDocs(collection(db, "pendingPayments"))
        ]);
        allTenants = tenantsSnap.docs.map(d => ({id: d.id, ...d.data()}));
        allProperties = propertiesSnap.docs.map(d => ({id: d.id, ...d.data()}));
        allPayments = paymentsSnap.docs.map(d => ({id: d.id, ...d.data()}));
        allPendingPayments = pendingSnap.docs.map(d => ({id: d.id, ...d.data()}));
    };

    await Promise.all([minDelayPromise, fetchAllData()]);

    updateSummary();
    renderAll();

    onSnapshot(collection(db, "tenants"), snap => {
        allTenants = snap.docs.map(d => ({id: d.id, ...d.data()}));
        renderAll(); updateSummary(); updateNotifications(allPayments, allTenants);
    });
    onSnapshot(collection(db, "properties"), snap => {
        allProperties = snap.docs.map(d => ({id: d.id, ...d.data()}));
        renderAll();
    });
    onSnapshot(query(collection(db, "payments"), orderBy("date", "desc")), snap => {
        allPayments = snap.docs.map(d => ({id: d.id, ...d.data()}));
        renderAll(); updateSummary(); updateNotifications(allPayments, allTenants);
    });
    onSnapshot(collection(db, "pendingPayments"), snap => {
        allPendingPayments = snap.docs.map(d => ({id: d.id, ...d.data()})); 
        renderAll();
    });
};

initApp();

document.getElementById('cancel-verification-btn').addEventListener('click', () => { closeModal(document.getElementById('confirm-verification-modal')); currentPendingPaymentId = null; });
document.getElementById('breakdown-rent').addEventListener('input', calculateTotal);
document.getElementById('breakdown-electricity').addEventListener('input', calculateTotal);
document.getElementById('breakdown-latefee').addEventListener('input', calculateTotal);
document.getElementById('breakdown-other').addEventListener('input', calculateTotal);
elements.promptForm.addEventListener('submit', (e) => { e.preventDefault(); if (promptCallback) promptCallback(elements.promptModalInput.value); closeModal(elements.promptModal); promptCallback = null; });
elements.submitPromptBtn.addEventListener('click', () => elements.promptForm.requestSubmit());
elements.cancelPromptBtn.addEventListener('click', () => { closeModal(elements.promptModal); promptCallback = null; });
elements.paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setButtonLoading(elements.savePaymentBtn, true);
    try {
        const formData = Object.fromEntries(new FormData(e.target).entries());
        const tenantId = formData.tenantId;
        const breakdown = { rent: parseFloat(document.getElementById('breakdown-rent').value) || 0, electricity: parseFloat(document.getElementById('breakdown-electricity').value) || 0, lateFee: parseFloat(document.getElementById('breakdown-latefee').value) || 0, other: parseFloat(document.getElementById('breakdown-other').value) || 0 };
        const dataToSave = { tenantId, amount: parseFloat(formData.amount), date: Timestamp.fromDate(new Date(formData.paymentDate)), paymentMode: formData.paymentMode, notes: formData.notes, breakdown, status: 'Verified' };
        if (editingPaymentId) {
            await setDoc(doc(db, 'payments', editingPaymentId), dataToSave, { merge: true });
            window.showToast('Payment updated successfully!');
        } else {
            await addDoc(collection(db, 'payments'), dataToSave);
            const tenant = allTenants.find(t => t.id === tenantId);
            const tenantRef = doc(db, 'tenants', tenantId);
            const nextDueDate = getNextDueDate(tenant.dueDate, tenant.rentDueDay);
            await setDoc(tenantRef, { status: 'Paid', dueDate: Timestamp.fromDate(nextDueDate), nextPaymentDate: Timestamp.fromDate(nextDueDate) }, { merge: true });
            window.showToast('Payment recorded successfully!');
        }
        closeModal(elements.paymentModal);
        editingPaymentId = null;
    } catch (error) {
        console.error('Error saving payment: ', error);
        window.showToast('Error saving payment.', 'error');
    } finally {
        setButtonLoading(elements.savePaymentBtn, false);
    }
});
elements.verificationTableBody.addEventListener('click', async (e) => {
    const button = e.target;
    const pendingPaymentId = button.dataset.id;
    if (!pendingPaymentId) return;
    const pendingPayment = allPendingPayments.find(p => p.id === pendingPaymentId);
    if (button.classList.contains('verify-btn')) {
        openVerificationModal(pendingPayment); 
    } else if (button.classList.contains('reject-btn')) {
        showPromptModal('Reason for Rejection', async (reason) => {
            if (reason && reason.trim() !== '') {
                setButtonLoading(elements.submitPromptBtn, true);
                try {
                    const tenantRef = doc(db, 'tenants', pendingPayment.tenantId);
                    await setDoc(tenantRef, { status: 'Overdue', rejectionReason: reason.trim() }, { merge: true });
                    await deleteDoc(doc(db, 'pendingPayments', pendingPaymentId));
                    window.showToast('Payment rejected successfully.');
                } catch (error) {
                    console.error('Error rejecting payment: ', error);
                    window.showToast('Error rejecting payment.', 'error');
                } finally {
                    setButtonLoading(elements.submitPromptBtn, false);
                }
            } else {
                window.showToast('Rejection reason cannot be empty.', 'error');
            }
        });
    }
});
// REPLACED FUNCTION: Handles verification for both single and installment payments
document.getElementById('confirm-verify-btn').addEventListener('click', async () => {
    if (!currentPendingPaymentId) return;
    const confirmBtn = document.getElementById('confirm-verify-btn');
    setButtonLoading(confirmBtn, true);
    const pendingPayment = allPendingPayments.find(p => p.id === currentPendingPaymentId);

    try {
        const tenant = allTenants.find(t => t.id === pendingPayment.tenantId);
        if (!tenant) throw new Error("Tenant not found for this payment.");

        // 1. Save the verified payment
        const paymentData = { 
            ...pendingPayment, 
            date: pendingPayment.time,
            verifiedDate: Timestamp.now(),
            status: 'Verified', 
            paymentMode: 'Online',
        };
        delete paymentData.time;
        await setDoc(doc(db, "payments", currentPendingPaymentId), paymentData);

        // 2. Unbill the charges if any
        const chargesRef = collection(db, "tenants", pendingPayment.tenantId, "monthly_charges");
        const unbilledQuery = query(chargesRef, where("isBilled", "==", false));
        const unbilledSnaps = await getDocs(unbilledQuery);
        const updatePromises = [];
        unbilledSnaps.forEach(doc => updatePromises.push(setDoc(doc.ref, { isBilled: true }, { merge: true })));
        await Promise.all(updatePromises);
        
        // 3. Check if total rent is paid to update tenant status
        const paymentsAfterDueDate = query(collection(db, "payments"), where("tenantId", "==", tenant.id), where("date", ">=", tenant.dueDate));
        const paidSnaps = await getDocs(paymentsAfterDueDate);
        const totalPaidForMonth = paidSnaps.docs.reduce((sum, doc) => sum + doc.data().amount, 0);

        // Calculate total due for the month again to be sure
        const settingsSnap = await getDoc(doc(db, "settings", "paymentRules"));
        const settings = settingsSnap.data();
        let totalDueForMonth = tenant.rent;
        unbilledSnaps.forEach(doc => { totalDueForMonth += (doc.data().electricityBill || 0) + (doc.data().otherCharges || 0); });
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const dueDate = new Date(tenant.dueDate.seconds * 1000);
        const daysOverdue = Math.max(0, Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24)));
        if (daysOverdue > settings.gracePeriodDays) {
            totalDueForMonth += (daysOverdue - settings.gracePeriodDays) * settings.lateFeePerDay;
        }

        // 4. Conditionally update tenant status
        if (totalPaidForMonth >= totalDueForMonth) {
            const tenantRef = doc(db, 'tenants', tenant.id);
            const nextDueDate = getNextDueDate(tenant.dueDate, tenant.rentDueDay);
            await setDoc(tenantRef, { status: 'Paid', dueDate: Timestamp.fromDate(nextDueDate), rejectionReason: '' }, { merge: true });
            window.showToast('Final installment verified. Tenant status updated to Paid!');
        } else {
             window.showToast(`Installment verified. ₹${(totalDueForMonth - totalPaidForMonth).toLocaleString('en-IN')} remaining.`);
        }

        // 5. Delete the pending payment record
        await deleteDoc(doc(db, 'pendingPayments', currentPendingPaymentId));

        closeModal(elements.confirmVerificationModal);
        currentPendingPaymentId = null;

    } catch (error) {
        console.error('Error verifying payment: ', error);
        window.showToast('Error verifying payment: ' + error.message, 'error');
    } finally {
        setButtonLoading(confirmBtn, false);
    }
});
document.getElementById('confirm-reject-btn').addEventListener('click', () => {
    closeModal(document.getElementById('confirm-verification-modal'));
    const rejectButton = document.querySelector(`#verification-table-body .reject-btn[data-id="${currentPendingPaymentId}"]`);
    if (rejectButton) rejectButton.click();
    currentPendingPaymentId = null;
});
elements.paymentTableBody.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const paymentId = button.dataset.id;
    if (button.classList.contains('edit-payment-btn')) {
        openPaymentModal(paymentId);
    } else if (button.classList.contains('delete-payment-btn')) {
        const deleteAction = async () => {
            try {
                const paymentToDelete = allPayments.find(p => p.id === paymentId);
                const tenant = allTenants.find(t => t.id === paymentToDelete.tenantId);
                const tenantRef = doc(db, 'tenants', tenant.id);
                const currentDueDate = new Date(tenant.dueDate.seconds * 1000);
                const previousDueDate = new Date(new Date(tenant.dueDate.seconds * 1000).setMonth(currentDueDate.getMonth() - 1));
                await setDoc(tenantRef, { status: 'Overdue', dueDate: Timestamp.fromDate(previousDueDate) }, { merge: true });
                const chargesDate = new Date(previousDueDate);
                const monthId = `${chargesDate.getFullYear()}-${String(chargesDate.getMonth() + 1).padStart(2, '0')}`;
                const hadCharges = paymentToDelete.breakdown && (paymentToDelete.breakdown.electricity > 0 || paymentToDelete.breakdown.other > 0);
                if (hadCharges) {
                    const chargeDocRef = doc(db, "tenants", tenant.id, "monthly_charges", monthId);
                    const chargeDocSnap = await getDoc(chargeDocRef);
                    if (chargeDocSnap.exists()) await setDoc(chargeDocRef, { isBilled: false }, { merge: true });
                }
                await deleteDoc(doc(db, 'payments', paymentId));
                window.showToast('Payment deleted successfully.');
            } catch (error) {
                console.error('Error deleting payment: ', error);
                window.showToast('Could not delete payment.', 'error');
            }
        };
        window.showConfirmModal('Delete Payment', 'Are you sure you want to delete this payment? This action cannot be undone.', deleteAction);
    }
});
elements.recordPaymentBtn.addEventListener('click', () => openPaymentModal());
elements.cancelPaymentBtn.addEventListener('click', () => closeModal(elements.paymentModal));
elements.searchInput.addEventListener('input', () => { currentPage = 1; renderAll(); });
elements.savePaymentBtn.addEventListener('click', () => { elements.paymentForm.requestSubmit(); });

elements.paginationControls.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const totalPages = Math.ceil(allPayments.length / rowsPerPage);
    if (btn.dataset.page) {
        currentPage = parseInt(btn.dataset.page, 10);
    } else if (btn.dataset.nav === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (btn.dataset.nav === 'next' && currentPage < totalPages) {
        currentPage++;
    }
    renderHistoryTable();
});
const setActiveTab = (activeTab) => {
    const inactiveTab = activeTab === elements.historyTab ? elements.verificationTab : elements.historyTab;
    activeTab.classList.add('tab-active');
    activeTab.classList.remove('border-transparent', 'text-gray-500');
    inactiveTab.classList.remove('tab-active');
    inactiveTab.classList.add('border-transparent', 'text-gray-500');
};
elements.historyTab.addEventListener('click', () => {
    elements.historyView.classList.remove('hidden');
    elements.verificationView.classList.add('hidden');
    setActiveTab(elements.historyTab);
});
elements.verificationTab.addEventListener('click', () => {
    elements.historyView.classList.add('hidden');
    elements.verificationView.classList.remove('hidden');
    setActiveTab(elements.verificationTab);
});
