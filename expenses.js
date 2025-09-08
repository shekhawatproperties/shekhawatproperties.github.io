// expenses.js

import { db } from './firebase-config.js';
import { collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, Timestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let allExpenses = [], allProperties = [], allPayments = [], allTenants = [], editingExpenseId = null;

const elements = {
    expenseTableBody: document.getElementById('expense-table-body'),
    addExpenseBtn: document.getElementById('add-expense-btn'),
    expenseModal: document.getElementById('expense-modal'),
    modalTitle: document.getElementById('modal-title'),
    cancelExpenseBtn: document.getElementById('cancel-expense-btn'),
    saveExpenseBtn: document.getElementById('save-expense-btn'),
    expenseForm: document.getElementById('expense-form'),
    linkedPropertySelect: document.getElementById('propertyId'),
    periodTotal: document.getElementById('period-total'),
    allTimeTotal: document.getElementById('all-time-total'),
    highestSpending: document.getElementById('highest-spending'),
    notificationBtn: document.getElementById('notification-btn'),
    activityModal: document.getElementById('activity-modal'),
    closeActivityModalBtn: document.getElementById('close-activity-modal'),
};

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

const populateDropdowns = () => {
    elements.linkedPropertySelect.innerHTML = '<option value="">None / General Expense</option>';
    allProperties.forEach(p => {
        elements.linkedPropertySelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
};

const renderTable = () => {
    elements.expenseTableBody.innerHTML = allExpenses.length === 0
        ? `<tr><td colspan="5" class="p-4 text-center text-gray-500">No expenses recorded yet.</td></tr>`
        : allExpenses.map(exp => {
            const prop = allProperties.find(p => p.id === exp.propertyId);
            const date = exp.date ? new Date(exp.date.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
            return `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="p-4">${date}</td>
                    <td class="p-4"><p class="font-semibold">${exp.category}</p><p class="text-sm text-gray-500">${exp.description}</p></td>
                    <td class="p-4">${prop ? prop.name : '<span class="text-gray-400">General</span>'}</td>
                    <td class="p-4 font-semibold text-right">₹${exp.amount.toLocaleString('en-IN')}</td>
                    <td class="p-4 text-center space-x-2">
                        <button data-id="${exp.id}" class="edit-expense-btn text-gray-500 hover:text-indigo-600 p-1"><i data-lucide="edit" class="w-5 h-5 pointer-events-none"></i></button>
                        <button data-id="${exp.id}" class="delete-expense-btn text-gray-500 hover:text-red-600 p-1"><i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i></button>
                    </td>
                </tr>`;
        }).join('');
    lucide.createIcons();
};

const updateSummary = () => {
    const allTimeTotal = allExpenses.reduce((sum, e) => sum + e.amount, 0);
    animateCounter(elements.allTimeTotal, allTimeTotal);

    const currentYear = new Date().getFullYear();
    const thisYearExpenses = allExpenses.filter(e => new Date(e.date.seconds * 1000).getFullYear() === currentYear);
    const periodTotal = thisYearExpenses.reduce((sum, e) => sum + e.amount, 0);
    animateCounter(elements.periodTotal, periodTotal);

    const categoryTotals = thisYearExpenses.reduce((acc, exp) => {
        const category = exp.category || 'Other';
        acc[category] = (acc[category] || 0) + exp.amount;
        return acc;
    }, {});

    const highestCategory = Object.keys(categoryTotals).length > 0
        ? Object.keys(categoryTotals).reduce((a, b) => categoryTotals[a] > categoryTotals[b] ? a : b)
        : '-';
    elements.highestSpending.textContent = highestCategory;
};

const openExpenseModal = (expenseId = null) => {
    elements.expenseForm.reset();
    editingExpenseId = expenseId;
    if (expenseId) {
        const exp = allExpenses.find(e => e.id === expenseId);
        elements.modalTitle.textContent = 'Edit Expense';
        elements.expenseForm.elements['date'].value = new Date(exp.date.seconds * 1000).toISOString().split('T')[0];
        elements.expenseForm.elements['category'].value = exp.category;
        elements.expenseForm.elements['description'].value = exp.description;
        elements.expenseForm.elements['amount'].value = exp.amount;
        elements.expenseForm.elements['propertyId'].value = exp.propertyId || "";
        elements.saveExpenseBtn.textContent = 'Update Expense';
    } else {
        elements.modalTitle.textContent = 'Add New Expense';
        elements.expenseForm.elements['date'].valueAsDate = new Date();
        elements.saveExpenseBtn.textContent = 'Save Expense';
    }
    elements.expenseModal.classList.remove('hidden');
};

onSnapshot(query(collection(db, "properties"), orderBy("name")), snap => {
    allProperties = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateDropdowns();
}, err => console.error(err));

onSnapshot(query(collection(db, "expenses"), orderBy("date", "desc")), snap => {
    allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable();
    updateSummary();
}, err => console.error(err));

onSnapshot(query(collection(db, "payments"), orderBy("date", "desc")), (snap) => {
    allPayments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateNotifications(allPayments, allTenants);
});
onSnapshot(collection(db, "tenants"), (snap) => {
    allTenants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateNotifications(allPayments, allTenants);
});

elements.addExpenseBtn.addEventListener('click', () => openExpenseModal());
elements.cancelExpenseBtn.addEventListener('click', () => elements.expenseModal.classList.add('hidden'));
elements.saveExpenseBtn.addEventListener('click', () => elements.expenseForm.requestSubmit());

elements.expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target).entries());
    const dataToSave = {
        ...formData,
        amount: parseInt(formData.amount),
        date: Timestamp.fromDate(new Date(formData.date)),
    };

    try {
        if (editingExpenseId) {
            await setDoc(doc(db, "expenses", editingExpenseId), dataToSave, { merge: true });
            window.showToast('Expense updated successfully!');
        } else {
            await addDoc(collection(db, "expenses"), dataToSave);
            window.showToast('Expense added successfully!');
        }
        elements.expenseModal.classList.add('hidden');
    } catch (error) {
        console.error("Error saving expense:", error);
        window.showToast("Error saving expense.", 'error');
    }
});

elements.expenseTableBody.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    const expenseId = button.dataset.id;
    if (button.classList.contains('edit-expense-btn')) {
        openExpenseModal(expenseId);
    } else if (button.classList.contains('delete-expense-btn')) {
        window.showConfirmModal('Delete Expense', 'Are you sure you want to delete this expense?', async () => {
            try {
                await deleteDoc(doc(db, "expenses", expenseId));
                window.showToast('Expense deleted.');
            } catch (error) {
                console.error("Error deleting expense:", error);
                window.showToast("Error deleting expense.", 'error');
            }
        });
    }
});