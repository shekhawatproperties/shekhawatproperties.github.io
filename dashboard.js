// dashboard.js

import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, getDoc, setDoc, query, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- UI Elements ---
const elements = {
    electricityMenuBtn: document.getElementById('electricity-menu-btn'),
    electricityFilterDropdown: document.getElementById('electricity-filter-dropdown'),
    incrementMenuBtn: document.getElementById('increment-menu-btn'),
    incrementFilterDropdown: document.getElementById('increment-filter-dropdown'),
};

let collectionChart, paymentStatusChart, incomeExpenseChart;
let allTenants = [], allProperties = [], allPayments = [], allExpenses = [], reminderTemplates = {};

// --- Helper Functions ---
const formatCurrency = (value) => `₹${(value || 0).toLocaleString('en-IN')}`;
const formatCurrencyLakhs = (value) => {
    if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
    if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value}`;
};

const animateCounter = (element, finalValue) => {
    if (!element) return;
    if (element.counterInterval) {
        clearInterval(element.counterInterval);
    }
    let start = 0;
    const duration = 1500;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = finalValue / steps;
    element.textContent = '₹0';

    element.counterInterval = setInterval(() => {
        start += increment;
        if (start >= finalValue) {
            clearInterval(element.counterInterval);
            start = finalValue;
        }
        element.textContent = `₹${Math.floor(start).toLocaleString('en-IN')}`;
    }, stepTime);
};

const getYearsFromData = (data, dateField) => {
    const years = [...new Set(data.map(p => new Date(p[dateField].seconds * 1000).getFullYear()))];
    return years.sort((a, b) => b - a);
};

function populateYearFilter(selectElement, years, includeAllTime = true) {
    if (!selectElement) return;
    const currentValue = selectElement.value;
    selectElement.innerHTML = '';
    if (includeAllTime) {
        selectElement.add(new Option('All Time', 'all'));
    }
    years.forEach(year => selectElement.add(new Option(year, year)));
    if (Array.from(selectElement.options).some(opt => opt.value === currentValue)) {
        selectElement.value = currentValue;
    }
}

// --- Dashboard Update Functions ---

function updateDashboardCards(isInitialLoad = false) {
    // Total Income Card
    const incomeFilterValue = document.getElementById('income-filter').value;
    const filteredIncomePayments = incomeFilterValue === 'all'
        ? allPayments
        : allPayments.filter(p => new Date(p.date.seconds * 1000).getFullYear() === parseInt(incomeFilterValue));
    const totalIncome = filteredIncomePayments.reduce((sum, p) => sum + ((p.breakdown && p.breakdown.rent) || (p.breakdown ? 0 : p.amount) || 0), 0);

    // Monthly Income Card
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyIncome = allPayments
        .filter(p => (p.date.seconds * 1000) >= startOfMonth.getTime())
        .reduce((sum, p) => sum + ((p.breakdown && p.breakdown.rent) || (p.breakdown ? 0 : p.amount) || 0), 0);

    // Deposits
    const activeTenants = allTenants.filter(t => t.status !== 'Archived');
    const totalDeposits = activeTenants.filter(t => t.depositStatus === 'Paid').reduce((sum, t) => sum + (t.deposit || 0), 0);

    // Electricity Card
    const electricityFilterValue = document.getElementById('electricity-filter').value;
    const filteredElectricityPayments = electricityFilterValue === 'all'
        ? allPayments
        : allPayments.filter(p => new Date(p.date.seconds * 1000).getFullYear() === parseInt(electricityFilterValue));
    const totalElectricity = filteredElectricityPayments.reduce((sum, p) => sum + ((p.breakdown && p.breakdown.electricity) || 0), 0);

    if (isInitialLoad) {
        animateCounter(document.getElementById('total-income'), totalIncome);
        animateCounter(document.getElementById('monthly-income'), monthlyIncome);
        animateCounter(document.getElementById('total-deposits'), totalDeposits);
        animateCounter(document.getElementById('total-electricity'), totalElectricity);
    } else {
        document.getElementById('total-income').textContent = formatCurrency(totalIncome);
        document.getElementById('monthly-income').textContent = formatCurrency(monthlyIncome);
        document.getElementById('total-deposits').textContent = formatCurrency(totalDeposits);
        document.getElementById('total-electricity').textContent = formatCurrency(totalElectricity);
    }

    document.getElementById('current-month-year').textContent = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

    // Increment Card
    const year1 = parseInt(document.getElementById('increment-year1').value);
    const year2 = parseInt(document.getElementById('increment-year2').value);
    const comparisonTextEl = document.getElementById('increment-comparison-text');

    if (!isNaN(year1) && !isNaN(year2)) {
        const incomeYear1 = allPayments.filter(p => new Date(p.date.seconds * 1000).getFullYear() === year1).reduce((sum, p) => sum + ((p.breakdown && p.breakdown.rent) || (p.breakdown ? 0 : p.amount) || 0), 0);
        const incomeYear2 = allPayments.filter(p => new Date(p.date.seconds * 1000).getFullYear() === year2).reduce((sum, p) => sum + ((p.breakdown && p.breakdown.rent) || (p.breakdown ? 0 : p.amount) || 0), 0);

        const incrementEl = document.getElementById('increment-percentage');
        if (incomeYear2 > 0) {
            const growth = ((incomeYear1 - incomeYear2) / incomeYear2) * 100;
            incrementEl.textContent = `${growth.toFixed(1)}%`;
            incrementEl.className = `text-2xl font-bold ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`;
        } else if (incomeYear1 > 0) {
            incrementEl.textContent = `+100%`;
            incrementEl.className = `text-2xl font-bold text-green-600`;
        } else {
            incrementEl.textContent = `0%`;
            incrementEl.className = `text-2xl font-bold text-gray-500`;
        }
        comparisonTextEl.textContent = `${year1} vs ${year2}`;
    } else {
        comparisonTextEl.textContent = `Select years to compare`;
    }
}

function updatePaymentStatusChart() {
    const activeTenants = allTenants.filter(t => t.status !== 'Archived');
    const statusCounts = activeTenants.reduce((acc, tenant) => {
        const status = tenant.status || 'Due';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { Paid: 0, Due: 0, Overdue: 0 });

    const labels = Object.keys(statusCounts);
    const data = Object.values(statusCounts);
    const colors = { Paid: '#22c55e', Due: '#facc15', Overdue: '#ef4444' };
    const backgroundColors = labels.map(label => colors[label] || '#9ca3af');

    if (!paymentStatusChart) {
        const ctx = document.getElementById('paymentStatusChart').getContext('2d');
        paymentStatusChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: backgroundColors, borderColor: '#ffffff', borderWidth: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
        });
    } else {
        paymentStatusChart.data.labels = labels;
        paymentStatusChart.data.datasets[0].data = data;
        paymentStatusChart.data.datasets[0].backgroundColor = backgroundColors;
        paymentStatusChart.update();
    }

    document.getElementById('payment-status-legend').innerHTML = labels.map((label, i) => `
        <div class="flex justify-between items-center text-sm"><span class="flex items-center"><span class="w-3 h-3 rounded-full mr-2" style="background-color: ${backgroundColors[i]}"></span>${label}</span><span class="font-semibold">${data[i]}</span></div>
    `).join('') || '<p class="text-center text-xs text-gray-500">No active tenants.</p>';
}

function updateCollectionChart() {
    const filter = document.getElementById('collection-chart-filter').value;
    let labels = [], data = [];
    const currentYear = new Date().getFullYear();
    const selectedYear = isNaN(parseInt(filter)) ? currentYear : parseInt(filter);
    const getRent = (p) => (p.breakdown && p.breakdown.rent) || (p.breakdown ? 0 : p.amount) || 0;

    if (filter === 'yearly') {
        const yearlyCollections = {};
        allPayments.forEach(p => {
            const year = new Date(p.date.seconds * 1000).getFullYear();
            yearlyCollections[year] = (yearlyCollections[year] || 0) + getRent(p);
        });
        labels = Object.keys(yearlyCollections).sort();
        data = labels.map(year => yearlyCollections[year]);
    } else {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        data = Array(12).fill(0);
        allPayments.forEach(p => {
            const paymentDate = new Date(p.date.seconds * 1000);
            if (paymentDate.getFullYear() === selectedYear) {
                data[paymentDate.getMonth()] += getRent(p);
            }
        });
    }

    const totalCollection = data.reduce((sum, val) => sum + val, 0);
    const nonEmptyMonths = data.filter(val => val > 0);
    const averageCollection = nonEmptyMonths.length > 0 ? totalCollection / nonEmptyMonths.length : 0;
    const highestCollection = data.length > 0 ? Math.max(...data) : 0;
    let growth = 0;
    if (filter !== 'yearly') {
        const lastYearTotal = allPayments.filter(p => new Date(p.date.seconds * 1000).getFullYear() === selectedYear - 1).reduce((sum, p) => sum + getRent(p), 0);
        if (lastYearTotal > 0) growth = ((totalCollection - lastYearTotal) / lastYearTotal) * 100;
        else if (totalCollection > 0) growth = 100;
    }

    document.getElementById('collection-summary').innerHTML = `
        <div><p class="text-sm text-gray-500">Total Collection</p><p class="text-xl font-bold">${formatCurrencyLakhs(totalCollection)}</p></div>
        <div><p class="text-sm text-gray-500">Average</p><p class="text-xl font-bold">${formatCurrencyLakhs(averageCollection)}</p></div>
        <div><p class="text-sm text-gray-500">Highest</p><p class="text-xl font-bold">${formatCurrencyLakhs(highestCollection)}</p></div>
        <div><p class="text-sm text-gray-500">Growth</p><p class="text-xl font-bold ${growth >= 0 ? 'text-green-600' : 'text-red-600'}">${growth.toFixed(1)}%</p></div>`;

    if (!collectionChart) {
        const ctx = document.getElementById('collectionGraph').getContext('2d');
        const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#4f46e5';
        collectionChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Collection', data, backgroundColor: themeColor, borderRadius: 8, barThickness: 30 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `Collection: ${formatCurrency(c.raw)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrencyLakhs(v) }, grid: { drawTicks: false, color: '#e5e7eb' }, border: { dash: [5, 5], display: false } }, x: { grid: { display: false } } } }
        });
    } else {
        collectionChart.data.labels = labels;
        collectionChart.data.datasets[0].data = data;
        collectionChart.update();
    }
}

function updateIncomeExpenseChart() {
    const filter = document.getElementById('income-expense-chart-filter').value;
    let labels = [], incomeData = [], expenseData = [];
    const getRent = (p) => (p.breakdown && p.breakdown.rent) || (p.breakdown ? 0 : p.amount) || 0;

    if (filter === '6m') {
        const monthlyData = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
            monthlyData[key] = { income: 0, expense: 0 };
            labels.push(d.toLocaleString('default', { month: 'short' }));
        }
        allPayments.forEach(p => {
            const d = new Date(p.date.seconds * 1000);
            const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
            if (monthlyData[key]) monthlyData[key].income += getRent(p);
        });
        allExpenses.forEach(e => {
            const d = new Date(e.date.seconds * 1000);
            const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
            if (monthlyData[key]) monthlyData[key].expense += e.amount;
        });
        incomeData = Object.values(monthlyData).map(d => d.income);
        expenseData = Object.values(monthlyData).map(d => d.expense);
    } else {
        const selectedYear = parseInt(filter);
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        incomeData = Array(12).fill(0);
        expenseData = Array(12).fill(0);
        allPayments.forEach(p => {
            const d = new Date(p.date.seconds * 1000);
            if (d.getFullYear() === selectedYear) incomeData[d.getMonth()] += getRent(p);
        });
        allExpenses.forEach(e => {
            const d = new Date(e.date.seconds * 1000);
            if (d.getFullYear() === selectedYear) expenseData[d.getMonth()] += e.amount;
        });
    }

    const totalIncome = incomeData.reduce((a, b) => a + b, 0);
    const totalExpense = expenseData.reduce((a, b) => a + b, 0);
    const netProfit = totalIncome - totalExpense;
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    document.getElementById('income-expense-summary').innerHTML = `
        <div><p class="text-sm text-gray-500">Total Income</p><p class="text-xl font-bold">${formatCurrencyLakhs(totalIncome)}</p></div>
        <div><p class="text-sm text-gray-500">Total Expense</p><p class="text-xl font-bold">${formatCurrencyLakhs(totalExpense)}</p></div>
        <div><p class="text-sm text-gray-500">Net Profit</p><p class="text-xl font-bold">${formatCurrencyLakhs(netProfit)}</p></div>
        <div><p class="text-sm text-gray-500">Profit Margin</p><p class="text-xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}">${profitMargin.toFixed(1)}%</p></div>`;

    if (!incomeExpenseChart) {
        const ctx = document.getElementById('incomeExpenseChart').getContext('2d');
        const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#4f46e5';
        incomeExpenseChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Income', data: incomeData, backgroundColor: themeColor, borderRadius: 6 }, { label: 'Expense', data: expenseData, backgroundColor: '#f97316', borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 6 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatCurrency(c.raw)}` } } }, scales: { y: { ticks: { callback: v => formatCurrencyLakhs(v) }, grid: { drawTicks: false }, border: { dash: [5, 5], display: false } }, x: { grid: { display: false } } } }
        });
    } else {
        incomeExpenseChart.data.labels = labels;
        incomeExpenseChart.data.datasets[0].data = incomeData;
        incomeExpenseChart.data.datasets[1].data = expenseData;
        incomeExpenseChart.update();
    }
}

function updateAllDashboardData(isInitialLoad = false) {
    if (!allPayments || !allTenants) return;
    updateDashboardCards(isInitialLoad);
    updatePaymentStatusChart();
    updateIncomeExpenseChart();
    updateCollectionChart();
}

// --- Modal and Action Logic ---

const sendWhatsAppReminder = (tenant, property) => {
    if (!tenant || !tenant.phone) {
        window.showToast("This tenant does not have a phone number saved.", "error");
        return;
    }
    const firstName = tenant.name.split(' ')[0];
    const propertyName = property ? property.name : "the property";
    const rent = (tenant.rent || 0).toLocaleString('en-IN');
    const dueDate = tenant.dueDate ? new Date(tenant.dueDate.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the due date';

    let template = reminderTemplates.due || "Hi {firstName}, your rent of ₹{rent} for {propertyName} is due on {dueDate}.";
    if (tenant.status === 'Overdue') {
        template = reminderTemplates.overdue || "Hi {firstName}, your rent for {propertyName} is overdue. Please pay immediately.";
    }

    const message = template
        .replace(/{firstName}/g, firstName)
        .replace(/{rent}/g, rent)
        .replace(/{propertyName}/g, propertyName)
        .replace(/{dueDate}/g, dueDate);

    window.open(`https://wa.me/${tenant.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
};

const initReminderModal = () => {
    const reminderModal = document.getElementById('reminder-modal');
    const sendReminderBtn = document.getElementById('send-reminder-btn');
    const closeReminderModalBtn = document.getElementById('close-reminder-modal');
    const reminderTenantList = document.getElementById('reminder-tenant-list');

    sendReminderBtn.addEventListener('click', () => {
        const tenantsToRemind = allTenants.filter(t => t.status === 'Due' || t.status === 'Overdue');
        if (tenantsToRemind.length === 0) {
            reminderTenantList.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">No tenants with due payments right now.</td></tr>`;
        } else {
            reminderTenantList.innerHTML = tenantsToRemind.map(t => {
                const property = allProperties.find(p => p.id === t.propertyId) || {};
                const statusColor = t.status === 'Overdue' ? 'text-red-600' : 'text-yellow-600';
                return `
                    <tr class="border-b">
                        <td class="p-2 font-semibold">${t.name}</td>
                        <td class="p-2">${property.name || 'N/A'}</td>
                        <td class="p-2 font-bold ${statusColor}">${t.status}</td>
                        <td class="p-2 text-center">
                            <button data-id="${t.id}" class="send-btn bg-green-100 text-green-700 px-3 py-1 text-xs font-semibold rounded-full">Send</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
        lucide.createIcons();
        reminderModal.classList.remove('hidden');
    });

    closeReminderModalBtn.addEventListener('click', () => reminderModal.classList.add('hidden'));

    reminderTenantList.addEventListener('click', (e) => {
        if (e.target.classList.contains('send-btn')) {
            const tenantId = e.target.dataset.id;
            const tenant = allTenants.find(t => t.id === tenantId);
            const property = allProperties.find(p => p.id === tenant.propertyId);
            sendWhatsAppReminder(tenant, property);
        }
    });
};

const initNoticeModal = () => {
    const noticeModal = document.getElementById('notice-modal');
    const updateNoticeBtn = document.getElementById('update-notice-btn');
    const closeNoticeModalBtn = document.getElementById('close-notice-modal');
    const cancelNoticeBtn = document.getElementById('cancel-notice-btn');
    const saveNoticeBtn = document.getElementById('save-notice-btn');
    const clearNoticeBtn = document.getElementById('clear-notice-btn');
    const noticeMessage = document.getElementById('notice-message');

    updateNoticeBtn.addEventListener('click', async () => {
        const noticeRef = doc(db, "settings", "noticeBoard");
        const noticeSnap = await getDoc(noticeRef);
        if (noticeSnap.exists()) noticeMessage.value = noticeSnap.data().message || "";
        noticeModal.classList.remove('hidden');
    });

    const closeNoticeModal = () => noticeModal.classList.add('hidden');
    closeNoticeModalBtn.addEventListener('click', closeNoticeModal);
    cancelNoticeBtn.addEventListener('click', closeNoticeModal);

    saveNoticeBtn.addEventListener('click', async () => {
        await setDoc(doc(db, "settings", "noticeBoard"), { message: noticeMessage.value });
        window.showToast('Notice updated successfully!');
        closeNoticeModal();
    });

    clearNoticeBtn.addEventListener('click', () => {
        window.showConfirmModal('Clear Notice?', 'Are you sure you want to clear the notice board?', async () => {
            await setDoc(doc(db, "settings", "noticeBoard"), { message: "" });
            window.showToast('Notice cleared!');
            noticeMessage.value = "";
            closeNoticeModal();
        });
    });
};

// --- App Initialization ---

const initApp = async () => {
    lucide.createIcons();

    document.getElementById('total-income').textContent = 'Loading...';
    document.getElementById('monthly-income').textContent = 'Loading...';
    document.getElementById('total-deposits').textContent = 'Loading...';
    document.getElementById('total-electricity').textContent = 'Loading...';

    const minDelayPromise = new Promise(resolve => setTimeout(resolve, 1500));

    const fetchAllData = async () => {
        const [tenantsSnap, paymentsSnap, expensesSnap, propertiesSnap, reminderTemplatesSnap] = await Promise.all([
            getDocs(collection(db, "tenants")),
            getDocs(query(collection(db, "payments"), orderBy("date", "desc"))),
            getDocs(collection(db, "expenses")),
            getDocs(collection(db, "properties")),
            getDoc(doc(db, "settings", "reminderMessages"))
        ]);
        allTenants = tenantsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        allPayments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        allExpenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        allProperties = propertiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        reminderTemplates = reminderTemplatesSnap.exists() ? reminderTemplatesSnap.data() : {};
    };

    await Promise.all([minDelayPromise, fetchAllData()]);

    const years = getYearsFromData(allPayments, 'date');
    populateYearFilter(document.getElementById('income-filter'), years);
    populateYearFilter(document.getElementById('electricity-filter'), years);
    populateYearFilter(document.getElementById('increment-year1'), years, false);
    populateYearFilter(document.getElementById('increment-year2'), years, false);
    if (years.length > 0) document.getElementById('increment-year1').value = years[0];
    if (years.length > 1) document.getElementById('increment-year2').value = years[1];

    const collectionFilter = document.getElementById('collection-chart-filter');
    populateYearFilter(collectionFilter, years, false);
    if (!collectionFilter.querySelector('option[value="yearly"]')) {
        collectionFilter.add(new Option('Yearly', 'yearly'), 0);
    }
    collectionFilter.value = collectionFilter.options[1]?.value || 'yearly';

    const incomeExpenseFilter = document.getElementById('income-expense-chart-filter');
    populateYearFilter(incomeExpenseFilter, years, false);
    if (!incomeExpenseFilter.querySelector('option[value="6m"]')) {
        incomeExpenseFilter.add(new Option('Last 6 Months', '6m'), 0);
    }
    incomeExpenseFilter.value = '6m';

    updateAllDashboardData(true);

    ['income-filter', 'electricity-filter', 'increment-year1', 'increment-year2', 'collection-chart-filter', 'income-expense-chart-filter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => updateAllDashboardData(false));
    });

    // Set up live listeners
    onSnapshot(collection(db, "tenants"), snap => {
        allTenants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateAllDashboardData(false);
    });
    onSnapshot(query(collection(db, "payments"), orderBy("date", "desc")), snap => {
        allPayments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateAllDashboardData(false);
    });
    onSnapshot(collection(db, "expenses"), snap => {
        allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateAllDashboardData(false);
    });
    onSnapshot(doc(db, "settings", "reminderMessages"), docSnap => {
        if (docSnap.exists()) reminderTemplates = docSnap.data();
    });
};

// --- Event Listeners ---
elements.electricityMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.electricityFilterDropdown.classList.toggle('hidden');
    elements.incrementFilterDropdown.classList.add('hidden');
});
elements.incrementMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.incrementFilterDropdown.classList.toggle('hidden');
    elements.electricityFilterDropdown.classList.add('hidden');
});

document.addEventListener('click', (event) => {
    if (elements.electricityMenuBtn && !elements.electricityMenuBtn.contains(event.target) && !elements.electricityFilterDropdown.contains(event.target)) {
        elements.electricityFilterDropdown.classList.add('hidden');
    }
    if (elements.incrementMenuBtn && !elements.incrementMenuBtn.contains(event.target) && !elements.incrementFilterDropdown.contains(event.target)) {
        elements.incrementFilterDropdown.classList.add('hidden');
    }
});

initReminderModal();
initNoticeModal();

document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
initApp();