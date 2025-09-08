// reports.js

import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

lucide.createIcons();

// --- Live Data Store ---
let allTenants = [];
let allProperties = [];
let allPayments = [];
let allExpenses = [];

// --- DOM Elements ---
const elements = {
    reportType: document.getElementById('report-type'),
    startDate: document.getElementById('start-date'),
    endDate: document.getElementById('end-date'),
    generateBtn: document.getElementById('generate-report-btn'),
    printBtn: document.getElementById('print-report-btn'),
    downloadBtn: document.getElementById('download-pdf-btn'),
    reportPreview: document.getElementById('report-preview'),
    dateFilters: document.getElementById('date-filters'),
    tenantFilter: document.getElementById('tenant-filter'),
    propertyFilter: document.getElementById('property-filter'),
    tenantDirectoryFilters: document.getElementById('tenant-directory-filters'),
    tenantSelect: document.getElementById('tenant-select'),
    propertySelect: document.getElementById('property-select'),
    tdSearch: document.getElementById('td-search'),
    tdPropertyFilter: document.getElementById('td-property-filter'),
};

// --- Fetch Live Data from Firestore ---
onSnapshot(collection(db, "tenants"), snap => {
    allTenants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateDropdowns();
});
onSnapshot(collection(db, "properties"), snap => {
    allProperties = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateDropdowns();
});
onSnapshot(collection(db, "payments"), snap => {
    allPayments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
});
onSnapshot(collection(db, "expenses"), snap => {
    allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

const formatDate = (dateObj) => dateObj ? dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';

const getDuration = (startDateTimestamp) => {
    if (!startDateTimestamp) return 'N/A';
    const start = new Date(startDateTimestamp.seconds * 1000);
    const end = new Date();
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    if (months < 0) {
        years--;
        months += 12;
    }
    return `${years}y, ${months}m`;
};

const populateDropdowns = () => {
    if (allTenants.length > 0) {
        elements.tenantSelect.innerHTML = allTenants.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
    if (allProperties.length > 0) {
        elements.propertySelect.innerHTML = allProperties.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        elements.tdPropertyFilter.innerHTML = '<option value="all">All Properties</option>' + allProperties.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }
};

const generateReport = () => {
    const type = elements.reportType.value;
    const start = new Date(elements.startDate.value);
    const end = new Date(elements.endDate.value);
    end.setHours(23, 59, 59, 999); // Include the whole end day

    let html = `<div class="prose max-w-none">`;
    html += `<div class="text-center mb-8"><h2 class="text-3xl font-bold">Shekhawat Market</h2>`;

    const filteredPayments = allPayments.filter(p => {
        const pDate = new Date(p.date.seconds * 1000);
        return pDate >= start && pDate <= end;
    });
    const filteredExpenses = allExpenses.filter(e => {
        const eDate = new Date(e.date.seconds * 1000);
        return eDate >= start && eDate <= end;
    });

    switch (type) {
        case 'tenantDirectory':
            html += `<h3 class="text-xl font-semibold m-0">Tenant Directory</h3><p class="text-sm text-gray-500 m-0">As of ${formatDate(new Date())}</p></div>`;
            html += generateTenantDirectory();
            break;
        case 'tenantLedger':
            const tenantId = elements.tenantSelect.value;
            const tenant = allTenants.find(t => t.id === tenantId);
            html += `<h3 class="text-xl font-semibold m-0">Tenant Ledger: ${tenant.name}</h3><p class="text-sm text-gray-500 m-0">From ${formatDate(start)} to ${formatDate(end)}</p></div>`;
            html += generateTenantLedger(filteredPayments.filter(p => p.tenantId === tenantId));
            break;
        case 'propertyIncome':
            const propertyId = elements.propertySelect.value;
            const property = allProperties.find(p => p.id === propertyId);
            html += `<h3 class="text-xl font-semibold m-0">Income Report: ${property.name}</h3><p class="text-sm text-gray-500 m-0">From ${formatDate(start)} to ${formatDate(end)}</p></div>`;
            html += generateIncomeReport(filteredPayments.filter(p => {
                const paymentTenant = allTenants.find(t => t.id === p.tenantId);
                return paymentTenant && paymentTenant.propertyId === propertyId;
            }));
            break;
        case 'latePayments':
            html += `<h3 class="text-xl font-semibold m-0">Late Payments Report</h3><p class="text-sm text-gray-500 m-0">From ${formatDate(start)} to ${formatDate(end)}</p></div>`;
            html += generateLatePaymentsReport(filteredPayments.filter(p => p.breakdown && p.breakdown.lateFee > 0));
            break;
        case 'pnl':
            html += `<h3 class="text-xl font-semibold m-0">Profit & Loss Statement</h3><p class="text-sm text-gray-500 m-0">From ${formatDate(start)} to ${formatDate(end)}</p></div>`;
            html += generatePnlReport(filteredPayments, filteredExpenses);
            break;
        case 'income':
            html += `<h3 class="text-xl font-semibold m-0">Income Report</h3><p class="text-sm text-gray-500 m-0">From ${formatDate(start)} to ${formatDate(end)}</p></div>`;
            html += generateIncomeReport(filteredPayments);
            break;
        case 'expense':
            html += `<h3 class="text-xl font-semibold m-0">Expense Report</h3><p class="text-sm text-gray-500 m-0">From ${formatDate(start)} to ${formatDate(end)}</p></div>`;
            html += generateExpenseReport(filteredExpenses);
            break;
    }

    html += `</div>`;
    elements.reportPreview.innerHTML = html;
    lucide.createIcons();
};

const generateTable = (headers, rows, footer) => {
    let table = `<table class="w-full text-sm mt-6"><thead><tr class="border-b bg-gray-50">`;
    headers.forEach(h => table += `<th class="text-left p-2 font-semibold">${h}</th>`);
    table += `</tr></thead><tbody>`;
    rows.forEach((row, index) => {
        table += `<tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b">`;
        row.forEach(cell => table += `<td class="p-2 align-top">${cell}</td>`);
        table += `</tr>`;
    });
    if (footer) {
        table += `</tbody><tfoot><tr class="border-t-2 font-bold bg-gray-100"><td class="p-2" colspan="${headers.length - 1}">${footer.label}</td><td class="p-2 text-right">${footer.value}</td></tr></tfoot>`;
    } else {
        table += `</tbody>`;
    }
    return table + `</table>`;
};

const generatePnlReport = (income, expenses) => {
    const totalIncome = income.reduce((sum, p) => sum + p.amount, 0);
    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalIncome - totalExpense;
    return `<div class="space-y-6 mt-6">
                <div><h4>Income Summary</h4><table class="w-full"><tr><td>Total Income Collected:</td><td class="text-right font-semibold">₹${totalIncome.toLocaleString('en-IN')}</td></tr></table></div>
                <div><h4>Expense Summary</h4><table class="w-full"><tr><td>Total Expenses:</td><td class="text-right font-semibold">₹${totalExpense.toLocaleString('en-IN')}</td></tr></table></div>
                <div class="border-t-2 pt-4 mt-4"><table class="w-full text-lg"><tr><td class="font-bold">Net Profit / (Loss):</td><td class="text-right font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}">₹${netProfit.toLocaleString('en-IN')}</td></tr></table></div>
            </div>`;
};

const generateIncomeReport = (income) => {
    const total = income.reduce((sum, p) => sum + p.amount, 0);
    const headers = ['Date', 'Tenant', 'Mode', 'Amount'];
    const rows = income.map(p => [formatDate(new Date(p.date.seconds * 1000)), allTenants.find(t => t.id === p.tenantId)?.name || 'N/A', p.paymentMode, `<div class="text-right">₹${p.amount.toLocaleString('en-IN')}</div>`]);
    const footer = { label: 'Total Income', value: `₹${total.toLocaleString('en-IN')}` };
    return generateTable(headers, rows, footer);
};

const generateExpenseReport = (expenses) => {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const headers = ['Date', 'Description', 'Amount'];
    const rows = expenses.map(e => [formatDate(new Date(e.date.seconds * 1000)), e.description, `<div class="text-right">₹${e.amount.toLocaleString('en-IN')}</div>`]);
    const footer = { label: 'Total Expenses', value: `₹${total.toLocaleString('en-IN')}` };
    return generateTable(headers, rows, footer);
};

const generateTenantLedger = (payments) => {
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const headers = ['Payment Date', 'Details', 'Mode', 'Amount'];
    const rows = payments.map(p => {
        const breakdown = p.breakdown || {};
        const details = `<div class="text-xs">
            ${breakdown.rent ? `Rent: ₹${breakdown.rent.toLocaleString('en-IN')}<br>` : ''}
            ${breakdown.electricity ? `Electricity: ₹${breakdown.electricity.toLocaleString('en-IN')}<br>` : ''}
            ${breakdown.lateFee ? `<span class="text-red-600">Late Fee: ₹${breakdown.lateFee.toLocaleString('en-IN')}</span><br>` : ''}
            ${breakdown.other ? `Other: ₹${breakdown.other.toLocaleString('en-IN')}` : ''}
        </div>`;
        return [formatDate(new Date(p.date.seconds * 1000)), details, p.paymentMode, `<div class="text-right">₹${p.amount.toLocaleString('en-IN')}</div>`];
    });
    const footer = { label: 'Total Paid', value: `₹${totalPaid.toLocaleString('en-IN')}` };
    return generateTable(headers, rows, footer);
};

const generateLatePaymentsReport = (payments) => {
    const total = payments.reduce((sum, p) => sum + p.breakdown.lateFee, 0);
    const headers = ['Payment Date', 'Tenant', 'Late Fee Paid'];
    const rows = payments.map(p => [formatDate(new Date(p.date.seconds * 1000)), allTenants.find(t => t.id === p.tenantId)?.name || 'N/A', `<div class="text-right">₹${p.breakdown.lateFee.toLocaleString('en-IN')}</div>`]);
    const footer = { label: 'Total Late Fees Collected', value: `₹${total.toLocaleString('en-IN')}` };
    return generateTable(headers, rows, footer);
};

const generateTenantDirectory = () => {
    const searchTerm = elements.tdSearch.value.toLowerCase();
    const propertyFilter = elements.tdPropertyFilter.value;

    const filteredTenants = allTenants.filter(t => {
        const matchesSearch = t.name.toLowerCase().includes(searchTerm);
        const matchesProp = propertyFilter === 'all' || t.propertyId == propertyFilter;
        return matchesSearch && matchesProp;
    });

    const headers = ['Name', 'Property', 'Status', 'Duration', 'Phone', 'Rent'];
    const rows = filteredTenants.map(t => {
        const propName = allProperties.find(p => p.id === t.propertyId)?.name || 'N/A';
        const status = t.status === 'Archived' ? `<span class="text-gray-500">${t.status}</span>` : `<span class="font-semibold" style="color: ${t.status === 'Paid' ? 'green' : (t.status === 'Due' ? 'orange' : 'red')}">${t.status}</span>`;
        return [t.name, propName, status, getDuration(t.agreementDate), t.phone, `<div class="text-right">₹${t.rent.toLocaleString('en-IN')}</div>`];
    });
    return generateTable(headers, rows, null);
};

// --- Event Listeners ---
elements.generateBtn.addEventListener('click', generateReport);
elements.printBtn.addEventListener('click', () => window.print());
elements.downloadBtn.addEventListener('click', () => window.showToast('PDF download functionality coming soon!'));

elements.reportType.addEventListener('change', (e) => {
    const type = e.target.value;
    elements.dateFilters.style.display = !['tenantDirectory'].includes(type) ? 'block' : 'none';
    elements.tenantFilter.style.display = type === 'tenantLedger' ? 'block' : 'none';
    elements.propertyFilter.style.display = type === 'propertyIncome' ? 'block' : 'none';
    elements.tenantDirectoryFilters.style.display = type === 'tenantDirectory' ? 'block' : 'none';
});

// Set default dates for the current year
const today = new Date();
const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
elements.startDate.value = firstDayOfYear.toISOString().split('T')[0];
elements.endDate.value = today.toISOString().split('T')[0];