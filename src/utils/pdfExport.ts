/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Receipt, RentCharge, Payment } from '../types/index.ts';

// Helper to format currency in KSh
const formatKSh = (cents: number | string | undefined | null): string => {
  if (cents === undefined || cents === null) return 'KSh 0';
  const val = typeof cents === 'string' ? parseInt(cents, 10) : cents;
  if (isNaN(val)) return 'KSh 0';
  return `KSh ${(val / 100).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDate = (isoString?: string | null): string => {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Africa/Nairobi'
    });
  } catch {
    return isoString;
  }
};

const getNowNairobi = (): string => {
  return new Date().toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'medium',
    timeStyle: 'short'
  }) + ' EAT';
};

/**
 * Common document header with KodiPay branding
 */
const addDocumentHeader = (doc: jsPDF, title: string, subtitle?: string) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top header banner background
  doc.setFillColor(15, 23, 42); // slate-900 / navy
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Accent stripe
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 28, pageWidth, 2, 'F');

  // Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('KODIPAY KENYA', 14, 13);

  // Subtitle / tag
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(191, 219, 254); // blue-200
  doc.text('Property & Rental Payment Management System · Nairobi, Kenya', 14, 21);

  // Document Title on the right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), pageWidth - 14, 13, { align: 'right' });

  // Timestamp
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Generated: ${getNowNairobi()}`, pageWidth - 14, 21, { align: 'right' });

  // Optional subtitle below header
  if (subtitle) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 14, 35);
    return 39;
  }

  return 34;
};

/**
 * Common document footer with page numbering and authenticity note
 */
const addDocumentFooter = (doc: jsPDF) => {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('KodiPay Kenya · Secure & Audited Tenancy Ledger · Africa/Nairobi EAT', 14, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }
};

/**
 * 1. OFFICIAL RENT PAYMENT RECEIPT PDF
 */
export const exportReceiptPDF = (receipt: Receipt) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const startY = addDocumentHeader(doc, 'Payment Receipt');

  // Receipt Number & Date Banner
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(14, startY, pageWidth - 28, 20, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, pageWidth - 28, 20, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('OFFICIAL RECEIPT NO:', 20, startY + 8);
  doc.setFontSize(13);
  doc.setTextColor(30, 58, 138); // blue-900
  doc.text(receipt.receipt_number, 20, startY + 15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('PAYMENT DATE:', pageWidth - 70, startY + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formatDate(receipt.payment_date), pageWidth - 70, startY + 15);

  // Status Badge
  const isReversed = receipt.payment_status === 'reversed';
  if (isReversed) {
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(pageWidth - 60, startY + 2, 45, 6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(185, 28, 28);
    doc.text('REVERSED PAYMENT', pageWidth - 37.5, startY + 6.5, { align: 'center' });
  }

  // Tenant & Property Info Cards
  const cardY = startY + 25;
  const colWidth = (pageWidth - 32) / 2;

  // Tenant Box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, cardY, colWidth, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('RECEIVED FROM (TENANT)', 20, cardY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(receipt.tenant_name || 'N/A', 20, cardY + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Phone: ${receipt.tenant_phone || '—'}`, 20, cardY + 21);
  doc.text(`National ID: ${receipt.tenant_national_id || '—'}`, 20, cardY + 27);
  doc.text(`Tenant ID: ${receipt.tenant_id ? receipt.tenant_id.slice(0, 12) + '...' : '—'}`, 20, cardY + 33);

  // Property Box
  const propX = 14 + colWidth + 4;
  doc.roundedRect(propX, cardY, colWidth, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PROPERTY & PREMISES', propX + 6, cardY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(receipt.property_name || '—', propX + 6, cardY + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 58, 138);
  doc.text(`Unit: ${receipt.unit_number || '—'} ${receipt.unit_type ? `(${receipt.unit_type})` : ''}`, propX + 6, cardY + 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(receipt.property_address || 'Kenya', propX + 6, cardY + 27);
  doc.text(`Period Covered: ${receipt.period_covered || '—'}`, propX + 6, cardY + 33);

  // Payment Breakdown Table
  const methodLabel = receipt.payment_method === 'mpesa'
    ? 'M-Pesa Mobile Money'
    : receipt.payment_method === 'bank_transfer'
    ? 'Bank Transfer / Wire'
    : receipt.payment_method === 'cash'
    ? 'Cash Payment'
    : receipt.payment_method || 'Electronic';

  const refLabel = receipt.transaction_reference || receipt.payment_reference || 'N/A';

  autoTable(doc, {
    startY: cardY + 44,
    head: [['Description / Allocation', 'Payment Channel', 'Reference / Paybill Code', 'Amount Received']],
    body: [
      [
        `Rent Payment - Period: ${receipt.period_covered}\nUnit: ${receipt.unit_number} (${receipt.property_name})`,
        methodLabel,
        refLabel,
        formatKSh(receipt.amount_cents)
      ]
    ],
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
      cellPadding: 4
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 40 },
      2: { cellWidth: 40, font: 'courier' },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  const tableFinalY = (doc as any).lastAutoTable.finalY || cardY + 70;

  // Totals & Balance Summary Box
  const summaryBoxWidth = 75;
  const summaryBoxX = pageWidth - 14 - summaryBoxWidth;
  const summaryBoxY = tableFinalY + 6;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(summaryBoxX, summaryBoxY, summaryBoxWidth, 30, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Total Amount Paid:', summaryBoxX + 6, summaryBoxY + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(formatKSh(receipt.amount_cents), summaryBoxX + summaryBoxWidth - 6, summaryBoxY + 8, { align: 'right' });

  doc.setDrawColor(226, 232, 240);
  doc.line(summaryBoxX + 4, summaryBoxY + 14, summaryBoxX + summaryBoxWidth - 4, summaryBoxY + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(receipt.remaining_balance_cents > 0 ? 185 : 21, receipt.remaining_balance_cents > 0 ? 28 : 128, receipt.remaining_balance_cents > 0 ? 28 : 61);
  doc.text('Remaining Arrears / Balance:', summaryBoxX + 6, summaryBoxY + 22);
  doc.setFontSize(11);
  doc.text(formatKSh(receipt.remaining_balance_cents), summaryBoxX + summaryBoxWidth - 6, summaryBoxY + 22, { align: 'right' });

  // Verification & Official Stamp Seal
  const stampX = 14;
  const stampY = summaryBoxY;

  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.8);
  doc.roundedRect(stampX, stampY, 90, 30, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 58, 138);
  doc.text('OFFICIAL VERIFIED RECEIPT', stampX + 45, stampY + 7, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Confirmed & Recorded in KodiPay Kenya Registry', stampX + 45, stampY + 13, { align: 'center' });
  doc.text(`Issued by: ${receipt.issued_by_name || 'KodiPay Automated System'}`, stampX + 45, stampY + 19, { align: 'center' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.text(`Audit ID: ${receipt.id.slice(0, 16)}`, stampX + 45, stampY + 25, { align: 'center' });

  // Bottom Legal & Tenancy Terms
  const termsY = stampY + 38;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Important Notice & Tenancy Acknowledgment:', 14, termsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const termsText = [
    '1. This receipt is an official computer-generated document under Kenyan tenancy and contract laws.',
    '2. Payment is subject to confirmation and clearance by the banking institution or Safaricom M-Pesa.',
    '3. For inquiries, balance reconciliation, or disputes, contact your property management office quoting the receipt number above.'
  ];
  termsText.forEach((line, index) => {
    doc.text(line, 14, termsY + 5 + (index * 4.5));
  });

  addDocumentFooter(doc);

  // Download File
  doc.save(`KodiPay_Receipt_${receipt.receipt_number}.pdf`);
};

/**
 * 2. RENT ROLL & MONTHLY RENT REGISTER PDF
 */
export const exportRentRollPDF = (
  charges: RentCharge[],
  month: string,
  propertyName?: string
) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const subtitle = propertyName
    ? `Billing Month: ${month} · Property: ${propertyName}`
    : `Billing Month: ${month} · All Managed Properties`;

  const startY = addDocumentHeader(doc, 'Rent Roll & Collection Register', subtitle);

  // Financial KPI totals
  const totalDue = charges.reduce((acc, c) => acc + parseInt(c.rent_due_cents as any, 10), 0);
  const totalPaid = charges.reduce((acc, c) => acc + parseInt(c.amount_paid_cents as any, 10), 0);
  const totalBalance = charges.reduce((acc, c) => acc + parseInt(c.balance_cents as any, 10), 0);
  const rate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  const pageWidth = doc.internal.pageSize.getWidth();
  const kpiY = startY;

  // KPI boxes
  const boxW = (pageWidth - 28 - 12) / 4;
  const boxes = [
    { label: 'TOTAL EXPECTED RENT', value: formatKSh(totalDue), color: [15, 23, 42] },
    { label: 'CONFIRMED COLLECTED', value: formatKSh(totalPaid), color: [21, 128, 61] },
    { label: 'OUTSTANDING ARREARS', value: formatKSh(totalBalance), color: [185, 28, 28] },
    { label: 'COLLECTION EFFICIENCY', value: `${rate}%`, color: [30, 58, 138] }
  ];

  boxes.forEach((b, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, boxW, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, x + 4, kpiY + 4.5);

    doc.setFontSize(10.5);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.text(b.value, x + 4, kpiY + 11);
  });

  // Table Body
  const tableData = charges.map((c) => [
    c.property_name || '—',
    `Unit ${c.unit_number}`,
    c.tenant_name || '—',
    c.tenant_phone || '—',
    c.billing_month,
    formatKSh(c.rent_due_cents),
    formatKSh(c.amount_paid_cents),
    formatKSh(c.balance_cents),
    formatDate(c.due_date),
    c.status.replace('_', ' ').toUpperCase()
  ]);

  autoTable(doc, {
    startY: kpiY + 18,
    head: [[
      'Property',
      'Unit',
      'Tenant Name',
      'Phone',
      'Month',
      'Rent Due',
      'Paid',
      'Balance',
      'Due Date',
      'Status'
    ]],
    body: tableData,
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.5
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 20 },
      2: { cellWidth: 42 },
      3: { cellWidth: 28, font: 'courier' },
      4: { cellWidth: 20, font: 'courier' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 26, halign: 'right', textColor: [21, 128, 61], fontStyle: 'bold' },
      7: { cellWidth: 26, halign: 'right', textColor: [185, 28, 28], fontStyle: 'bold' },
      8: { cellWidth: 24 },
      9: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  addDocumentFooter(doc);

  const cleanMonth = month.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`KodiPay_Rent_Roll_${cleanMonth}.pdf`);
};

/**
 * 3. PAYMENTS TRANSACTION LEDGER STATEMENT PDF
 */
export const exportPaymentsStatementPDF = (
  payments: Payment[],
  filterTitle?: string
) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const subtitle = filterTitle
    ? `Transactions Filter: ${filterTitle} · Total Records: ${payments.length}`
    : `Complete Payment Audit Trail · Total Records: ${payments.length}`;

  const startY = addDocumentHeader(doc, 'Payments Transaction Ledger', subtitle);

  const confirmedPayments = payments.filter((p) => p.status === 'confirmed');
  const totalConfirmedCents = confirmedPayments.reduce(
    (acc, p) => acc + parseInt(p.amount_cents as any, 10),
    0
  );

  const pendingPayments = payments.filter((p) => p.status === 'pending_verification');
  const totalPendingCents = pendingPayments.reduce(
    (acc, p) => acc + parseInt(p.amount_cents as any, 10),
    0
  );

  const pageWidth = doc.internal.pageSize.getWidth();
  const kpiY = startY;

  // KPI boxes
  const boxW = (pageWidth - 28 - 8) / 3;
  const boxes = [
    { label: 'CONFIRMED COLLECTIONS', value: formatKSh(totalConfirmedCents), color: [21, 128, 61] },
    { label: 'PENDING VERIFICATION', value: formatKSh(totalPendingCents), color: [202, 138, 4] },
    { label: 'RECORDED TRANSACTIONS', value: `${payments.length} Payments`, color: [15, 23, 42] }
  ];

  boxes.forEach((b, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, boxW, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, x + 4, kpiY + 4.5);

    doc.setFontSize(10.5);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.text(b.value, x + 4, kpiY + 11);
  });

  const tableData = payments.map((p) => [
    p.payment_reference,
    p.tenant_name || '—',
    `${p.property_name || '—'} · Unit ${p.unit_number || '—'}`,
    p.payment_method === 'mpesa' ? 'M-Pesa Mobile' : p.payment_method.replace('_', ' '),
    p.transaction_reference || 'N/A',
    formatDate(p.payment_date),
    formatKSh(p.amount_cents),
    p.receipt_number || '—',
    p.status.toUpperCase()
  ]);

  autoTable(doc, {
    startY: kpiY + 18,
    head: [[
      'Ref Number',
      'Tenant',
      'Property & Unit',
      'Channel',
      'Trans Ref / M-Pesa',
      'Date',
      'Amount Received',
      'Receipt #',
      'Status'
    ]],
    body: tableData,
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.5
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 26, font: 'courier', fontStyle: 'bold' },
      1: { cellWidth: 42 },
      2: { cellWidth: 45 },
      3: { cellWidth: 26 },
      4: { cellWidth: 35, font: 'courier' },
      5: { cellWidth: 22 },
      6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 28, font: 'courier' },
      8: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  addDocumentFooter(doc);

  const dateTag = new Date().toISOString().slice(0, 10);
  doc.save(`KodiPay_Payments_Statement_${dateTag}.pdf`);
};

/**
 * 4. OVERDUE ARREARS & DEFAULTERS REPORT PDF
 */
export const exportArrearsReportPDF = (arrears: RentCharge[]) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const totalOverdueCents = arrears.reduce(
    (acc, c) => acc + parseInt(c.balance_cents as any, 10),
    0
  );

  const startY = addDocumentHeader(
    doc,
    'Overdue Rent & Default Arrears Report',
    'Official arrears schedule for units exceeding configured grace period'
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  // Top Alert Box
  doc.setFillColor(254, 242, 242); // rose-50
  doc.setDrawColor(254, 205, 211); // rose-200
  doc.roundedRect(14, startY, pageWidth - 28, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(159, 18, 57);
  doc.text('TOTAL OUTSTANDING ARREARS:', 20, startY + 8);
  doc.setFontSize(14);
  doc.text(formatKSh(totalOverdueCents), 20, startY + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(136, 19, 55);
  doc.text(`Total Defaulter Accounts: ${arrears.length}`, pageWidth - 70, startY + 8);
  doc.text('Requires prompt M-Pesa / Bank collection', pageWidth - 70, startY + 14);

  const tableData = arrears.map((c) => [
    c.tenant_name || '—',
    c.tenant_phone || '—',
    `${c.property_name || '—'} · Unit ${c.unit_number}`,
    c.billing_month,
    formatKSh(c.rent_due_cents),
    formatKSh(c.amount_paid_cents),
    formatKSh(c.balance_cents),
    formatDate(c.due_date)
  ]);

  autoTable(doc, {
    startY: startY + 28,
    head: [[
      'Tenant Name',
      'Phone Number',
      'Property & Unit',
      'Month',
      'Original Due',
      'Paid',
      'Arrears Balance',
      'Due Date'
    ]],
    body: tableData,
    headStyles: {
      fillColor: [159, 18, 57], // rose-900
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 3
    },
    alternateRowStyles: {
      fillColor: [255, 241, 242]
    },
    columnStyles: {
      0: { cellWidth: 36, fontStyle: 'bold' },
      1: { cellWidth: 26, font: 'courier' },
      2: { cellWidth: 40 },
      3: { cellWidth: 18, font: 'courier' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 26, halign: 'right', textColor: [185, 28, 28], fontStyle: 'bold' },
      7: { cellWidth: 22 }
    },
    margin: { left: 14, right: 14 }
  });

  addDocumentFooter(doc);

  const dateTag = new Date().toISOString().slice(0, 10);
  doc.save(`KodiPay_Arrears_Report_${dateTag}.pdf`);
};

/**
 * 5. TENANT STATEMENT OF ACCOUNT (LEDGER) PDF
 */
export const exportTenantStatementPDF = (data: {
  tenant: any;
  statement: any[];
  payments: any[];
  financials?: any;
}) => {
  const { tenant, statement, payments, financials } = data;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const startY = addDocumentHeader(
    doc,
    'Tenant Statement of Account',
    'Official Resident Account Summary and Payment Ledger'
  );

  // Tenant Details Strip
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, pageWidth - 28, 36, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('RESIDENT DETAILS', 20, startY + 7);

  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(tenant?.tenant_name || tenant?.name || 'Resident', 20, startY + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Phone: ${tenant?.phone_number || tenant?.phone || '—'}`, 20, startY + 20);
  doc.text(`Email: ${tenant?.email || '—'}`, 20, startY + 26);
  doc.text(`National ID: ${tenant?.national_id || '—'}`, 20, startY + 32);

  const rightColX = pageWidth / 2 + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PREMISES & LEASE INFORMATION', rightColX, startY + 7);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`${tenant?.property_name || 'Property'} · Unit ${tenant?.unit_number || '—'}`, rightColX, startY + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Monthly Rent: ${formatKSh(tenant?.rent_amount_cents || tenant?.monthly_rent_cents || 0)}`, rightColX, startY + 20);
  doc.text(`Deposit Held: ${formatKSh(tenant?.deposit_cents || 0)}`, rightColX, startY + 26);
  doc.text(`Lease Start: ${formatDate(tenant?.start_date)}`, rightColX, startY + 32);

  // Arrears Banner
  const totalArrears = financials?.totalArrearsCents || 0;
  const alertY = startY + 41;

  doc.setFillColor(totalArrears > 0 ? 254 : 240, totalArrears > 0 ? 242 : 253, totalArrears > 0 ? 242 : 244);
  doc.setDrawColor(totalArrears > 0 ? 254 : 187, totalArrears > 0 ? 205 : 247, totalArrears > 0 ? 211 : 208);
  doc.roundedRect(14, alertY, pageWidth - 28, 14, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(totalArrears > 0 ? 159 : 21, totalArrears > 0 ? 18 : 128, totalArrears > 0 ? 57 : 61);
  doc.text(
    totalArrears > 0
      ? `CURRENT OUTSTANDING BALANCE: ${formatKSh(totalArrears)} (Payable via M-Pesa)`
      : 'CURRENT ACCOUNT STATUS: ALL RENT CHARGES FULLY CLEARED',
    20,
    alertY + 9
  );

  // Billing History Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Monthly Rent Charges & Invoices', 14, alertY + 22);

  const invoiceData = (statement || []).map((s) => [
    s.billing_month,
    formatKSh(s.rent_due_cents),
    formatKSh(s.amount_paid_cents),
    formatKSh(s.balance_cents),
    formatDate(s.due_date),
    s.status.toUpperCase()
  ]);

  autoTable(doc, {
    startY: alertY + 25,
    head: [['Month', 'Rent Due', 'Amount Paid', 'Balance', 'Due Date', 'Status']],
    body: invoiceData,
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.5
    },
    columnStyles: {
      0: { cellWidth: 26, font: 'courier', fontStyle: 'bold' },
      1: { cellWidth: 32, halign: 'right' },
      2: { cellWidth: 32, halign: 'right', textColor: [21, 128, 61], fontStyle: 'bold' },
      3: { cellWidth: 32, halign: 'right', textColor: [185, 28, 28], fontStyle: 'bold' },
      4: { cellWidth: 32 },
      5: { cellWidth: 28, halign: 'center', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  const invoicesTableFinalY = (doc as any).lastAutoTable.finalY || alertY + 80;

  // Payments History Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Payment Receipt History', 14, invoicesTableFinalY + 10);

  const paymentData = (payments || []).map((p) => [
    p.receipt_number || p.payment_reference,
    p.payment_method === 'mpesa' ? 'M-Pesa Mobile' : p.payment_method.replace('_', ' '),
    p.transaction_reference || '—',
    formatDate(p.payment_date),
    formatKSh(p.amount_cents),
    p.status.toUpperCase()
  ]);

  autoTable(doc, {
    startY: invoicesTableFinalY + 13,
    head: [['Receipt / Ref #', 'Channel', 'Trans Ref / M-Pesa Code', 'Date', 'Amount Paid', 'Status']],
    body: paymentData,
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.5
    },
    columnStyles: {
      0: { cellWidth: 35, font: 'courier', fontStyle: 'bold' },
      1: { cellWidth: 30 },
      2: { cellWidth: 42, font: 'courier' },
      3: { cellWidth: 26 },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [21, 128, 61] },
      5: { cellWidth: 21, halign: 'center', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  addDocumentFooter(doc);

  const cleanName = (tenant?.tenant_name || tenant?.name || 'Tenant').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`KodiPay_Statement_${cleanName}.pdf`);
};

/**
 * 6. FINANCIAL & ANNUAL PERFORMANCE REPORT PDF
 */
export const exportFinancialSummaryPDF = (data: any, year: string) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const startY = addDocumentHeader(
    doc,
    'Financial & Performance Analytics',
    `Annual Performance Review & Channel Distribution (${year})`
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  // Channel Distribution Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Collection by Channel (M-Pesa vs Bank vs Cash)', 14, startY + 6);

  const totalCollectedAllMethods = data?.paymentMethodDistribution?.reduce(
    (acc: number, m: any) => acc + parseInt(m.total_amount_cents, 10),
    0
  ) || 0;

  const channelData = (data?.paymentMethodDistribution || []).map((m: any) => {
    const amount = parseInt(m.total_amount_cents, 10);
    const pct = totalCollectedAllMethods > 0 ? Math.round((amount / totalCollectedAllMethods) * 100) : 0;
    return [
      m.payment_method === 'mpesa' ? 'Safaricom M-Pesa' : m.payment_method.replace('_', ' ').toUpperCase(),
      `${m.transaction_count} payments`,
      formatKSh(amount),
      `${pct}%`
    ];
  });

  autoTable(doc, {
    startY: startY + 10,
    head: [['Payment Channel', 'Total Transactions', 'Total Collected', 'Share (%)']],
    body: channelData,
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2.5
    },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 40 },
      2: { cellWidth: 50, halign: 'right', fontStyle: 'bold', textColor: [21, 128, 61] },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  const channelFinalY = (doc as any).lastAutoTable.finalY || startY + 50;

  // Monthly Trend Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Monthly Rent Revenue & Collection Trend (${year})`, 14, channelFinalY + 8);

  const trendData = (data?.monthlyTrend || []).map((t: any) => {
    const expected = parseInt(t.expected_cents, 10);
    const collected = parseInt(t.collected_cents, 10);
    const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
    return [
      t.billing_month,
      formatKSh(expected),
      formatKSh(collected),
      formatKSh(t.arrears_cents),
      `${rate}%`
    ];
  });

  autoTable(doc, {
    startY: channelFinalY + 12,
    head: [['Billing Month', 'Expected Rent', 'Collected Rent', 'Arrears / Balance', 'Collection Rate']],
    body: trendData,
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2.5
    },
    columnStyles: {
      0: { cellWidth: 35, font: 'courier', fontStyle: 'bold' },
      1: { cellWidth: 38, halign: 'right' },
      2: { cellWidth: 38, halign: 'right', fontStyle: 'bold', textColor: [21, 128, 61] },
      3: { cellWidth: 38, halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] },
      4: { cellWidth: 33, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  const trendFinalY = (doc as any).lastAutoTable.finalY || channelFinalY + 70;

  // Property Portfolio Performance
  if (data?.propertyPerformance?.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Property Portfolio Performance', 14, trendFinalY + 8);

    const propData = data.propertyPerformance.map((p: any) => {
      const expected = parseInt(p.expected_cents, 10);
      const collected = parseInt(p.collected_cents, 10);
      const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
      return [
        p.name,
        p.code,
        `${p.occupied_units || 0}/${p.total_units || 0} units`,
        formatKSh(expected),
        formatKSh(collected),
        formatKSh(p.balance_cents),
        `${rate}%`
      ];
    });

    autoTable(doc, {
      startY: trendFinalY + 12,
      head: [['Property', 'Code', 'Occupancy', 'Expected', 'Collected', 'Balance', 'Rate']],
      body: propData,
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 7.5,
        cellPadding: 2.5
      },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold' },
        1: { cellWidth: 20, font: 'courier' },
        2: { cellWidth: 26 },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 26, halign: 'right', textColor: [21, 128, 61], fontStyle: 'bold' },
        5: { cellWidth: 26, halign: 'right', textColor: [185, 28, 28], fontStyle: 'bold' },
        6: { cellWidth: 16, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 }
    });
  }

  addDocumentFooter(doc);

  doc.save(`KodiPay_Financial_Performance_${year}.pdf`);
};

/**
 * 7. PROPERTIES & RENTAL UNITS PORTFOLIO PDF
 */
export const exportPropertiesPDF = (properties: any[]) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const startY = addDocumentHeader(
    doc,
    'Property Portfolio & Units Report',
    `Official Property Portfolio and Rental Units Status · Total Properties: ${properties.length}`
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  // Aggregate statistics
  const totalProperties = properties.length;
  const totalUnits = properties.reduce((acc, p) => acc + parseInt(p.total_units || 0, 10), 0);
  const occupiedUnits = properties.reduce((acc, p) => acc + parseInt(p.occupied_units || 0, 10), 0);
  const vacantUnits = properties.reduce((acc, p) => acc + parseInt(p.vacant_units || 0, 10), 0);
  const totalExpectedRentCents = properties.reduce((acc, p) => acc + parseInt(p.expected_monthly_rent_cents || 0, 10), 0);
  const overallOccupancy = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  // KPI boxes
  const boxW = (pageWidth - 28 - 16) / 5;
  const boxes = [
    { label: 'PROPERTIES', value: `${totalProperties} Estates`, color: [15, 23, 42] },
    { label: 'TOTAL UNITS', value: `${totalUnits} Units`, color: [30, 58, 138] },
    { label: 'OCCUPIED UNITS', value: `${occupiedUnits} (${overallOccupancy}%)`, color: [21, 128, 61] },
    { label: 'VACANT UNITS', value: `${vacantUnits} Units`, color: [202, 138, 4] },
    { label: 'MONTHLY EXPECTED', value: formatKSh(totalExpectedRentCents), color: [15, 23, 42] }
  ];

  boxes.forEach((b, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, startY, boxW, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, x + 4, startY + 4.5);

    doc.setFontSize(9.5);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.text(b.value, x + 4, startY + 11);
  });

  const tableData = properties.map((p) => {
    const tUnits = parseInt(p.total_units || 0, 10);
    const oUnits = parseInt(p.occupied_units || 0, 10);
    const vUnits = parseInt(p.vacant_units || 0, 10);
    const occ = tUnits > 0 ? Math.round((oUnits / tUnits) * 100) : 0;
    const rentCents = parseInt(p.expected_monthly_rent_cents || 0, 10);

    return [
      p.name,
      p.code,
      p.property_type || 'Residential',
      p.address || '—',
      `${p.estate ? p.estate + ', ' : ''}${p.city || 'Nairobi'}`,
      p.landlord_name || 'Assigned Manager',
      `${oUnits} / ${tUnits}`,
      `${vUnits}`,
      formatKSh(rentCents),
      `${occ}%`
    ];
  });

  autoTable(doc, {
    startY: startY + 18,
    head: [[
      'Property Name',
      'Code',
      'Type',
      'Physical Address',
      'Location / Estate',
      'Manager',
      'Occupancy',
      'Vacant',
      'Expected Rent',
      'Rate'
    ]],
    body: tableData,
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.5
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 20, font: 'courier' },
      2: { cellWidth: 24 },
      3: { cellWidth: 42 },
      4: { cellWidth: 32 },
      5: { cellWidth: 32 },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 16, halign: 'center' },
      8: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      9: { cellWidth: 15, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  addDocumentFooter(doc);

  const dateTag = new Date().toISOString().slice(0, 10);
  doc.save(`KodiPay_Properties_Report_${dateTag}.pdf`);
};

/**
 * 8. TENANTS & TENANCIES DIRECTORY PDF
 */
export const exportTenantsPDF = (tenants: any[]) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const startY = addDocumentHeader(
    doc,
    'Tenants & Tenancies Directory',
    `Official Tenant Directory, Lease Allocations, and Rent Balances · Total Tenants: ${tenants.length}`
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  // Aggregate stats
  const totalTenants = tenants.length;
  const activeTenancies = tenants.filter(t => t.property_name && t.is_active !== false).length;
  const totalRentCents = tenants.reduce((acc, t) => acc + parseInt(t.rent_amount_cents || 0, 10), 0);
  const totalArrearsCents = tenants.reduce((acc, t) => acc + parseInt(t.total_balance_cents || 0, 10), 0);

  const boxW = (pageWidth - 28 - 12) / 4;
  const boxes = [
    { label: 'REGISTERED TENANTS', value: `${totalTenants} Residents`, color: [15, 23, 42] },
    { label: 'ACTIVE LEASES', value: `${activeTenancies} Assigned`, color: [21, 128, 61] },
    { label: 'MONTHLY RENT ROLL', value: formatKSh(totalRentCents), color: [30, 58, 138] },
    { label: 'TOTAL ARREARS OUTSTANDING', value: formatKSh(totalArrearsCents), color: totalArrearsCents > 0 ? [185, 28, 28] : [21, 128, 61] }
  ];

  boxes.forEach((b, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, startY, boxW, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, x + 4, startY + 4.5);

    doc.setFontSize(10);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.text(b.value, x + 4, startY + 11);
  });

  const tableData = tenants.map((t) => {
    const rentCents = parseInt(t.rent_amount_cents || 0, 10);
    const balanceCents = parseInt(t.total_balance_cents || 0, 10);
    const status = t.is_active === false ? 'TERMINATED' : (t.property_name ? 'ACTIVE' : 'UNASSIGNED');

    return [
      t.full_name || t.name,
      t.phone_number || t.phone || '—',
      t.national_id || '—',
      t.email || '—',
      t.property_name || 'Unassigned',
      t.unit_number ? `Unit ${t.unit_number}` : '—',
      formatKSh(rentCents),
      formatKSh(balanceCents),
      t.start_date ? formatDate(t.start_date) : '—',
      status
    ];
  });

  autoTable(doc, {
    startY: startY + 18,
    head: [[
      'Tenant Name',
      'Phone Number',
      'National ID',
      'Email Address',
      'Assigned Property',
      'Unit',
      'Monthly Rent',
      'Arrears / Balance',
      'Lease Start',
      'Status'
    ]],
    body: tableData,
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.5
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 26, font: 'courier' },
      2: { cellWidth: 22, font: 'courier' },
      3: { cellWidth: 42 },
      4: { cellWidth: 36 },
      5: { cellWidth: 18 },
      6: { cellWidth: 26, halign: 'right' },
      7: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      8: { cellWidth: 22 },
      9: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  addDocumentFooter(doc);

  const dateTag = new Date().toISOString().slice(0, 10);
  doc.save(`KodiPay_Tenants_Report_${dateTag}.pdf`);
};

/**
 * 9. MASTER COMBINED PROPERTY & TENANT PDF REPORT
 */
export const exportCombinedReportPDF = (properties: any[], tenants: any[]) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const startY = addDocumentHeader(
    doc,
    'Property & Tenant Master Report',
    `Executive Portfolio Summary & Tenant Registry · Generated: ${getNowNairobi()}`
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  // Summary Metrics
  const totalProperties = properties.length;
  const totalUnits = properties.reduce((acc, p) => acc + parseInt(p.total_units || 0, 10), 0);
  const occupiedUnits = properties.reduce((acc, p) => acc + parseInt(p.occupied_units || 0, 10), 0);
  const totalTenants = tenants.length;
  const totalRentCents = properties.reduce((acc, p) => acc + parseInt(p.expected_monthly_rent_cents || 0, 10), 0);
  const totalArrearsCents = tenants.reduce((acc, t) => acc + parseInt(t.total_balance_cents || 0, 10), 0);
  const occRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  // KPI boxes
  const boxW = (pageWidth - 28 - 20) / 6;
  const boxes = [
    { label: 'PROPERTIES', value: `${totalProperties}`, color: [15, 23, 42] },
    { label: 'TOTAL UNITS', value: `${totalUnits}`, color: [30, 58, 138] },
    { label: 'OCCUPANCY', value: `${occRate}%`, color: [21, 128, 61] },
    { label: 'TENANTS', value: `${totalTenants}`, color: [15, 23, 42] },
    { label: 'EXPECTED RENT', value: formatKSh(totalRentCents), color: [21, 128, 61] },
    { label: 'ARREARS', value: formatKSh(totalArrearsCents), color: totalArrearsCents > 0 ? [185, 28, 28] : [21, 128, 61] }
  ];

  boxes.forEach((b, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, startY, boxW, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, x + 3, startY + 4.5);

    doc.setFontSize(9);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.text(b.value, x + 3, startY + 11);
  });

  // Section 1: Properties Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Managed Properties & Unit Allocation Summary', 14, startY + 20);

  const propRows = properties.map((p) => [
    p.name,
    p.code,
    p.property_type || 'Residential',
    `${p.address || ''}, ${p.city || 'Nairobi'}`,
    `${p.occupied_units || 0} / ${p.total_units || 0}`,
    `${p.vacant_units || 0}`,
    formatKSh(p.expected_monthly_rent_cents || 0)
  ]);

  autoTable(doc, {
    startY: startY + 23,
    head: [['Property Name', 'Code', 'Type', 'Physical Location', 'Occupied / Total', 'Vacant', 'Expected Rent (KSh)']],
    body: propRows,
    headStyles: { fillColor: [15, 23, 42], fontSize: 7.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 25, font: 'courier' },
      2: { cellWidth: 30 },
      3: { cellWidth: 70 },
      4: { cellWidth: 30, halign: 'center' },
      5: { cellWidth: 25, halign: 'center' },
      6: { cellWidth: 39, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  const propFinalY = (doc as any).lastAutoTable.finalY || startY + 70;

  // Section 2: Tenants Table (on new page if needed or below)
  const nextY = propFinalY + 10;
  if (nextY > 160) {
    doc.addPage();
    addDocumentHeader(doc, 'Property & Tenant Master Report (Cont.)');
  }

  const tenantStartY = (nextY > 160) ? 36 : nextY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Tenant Registry & Current Balances', 14, tenantStartY);

  const tenantRows = tenants.map((t) => [
    t.full_name || t.name,
    t.phone_number || t.phone || '—',
    t.property_name || 'Unassigned',
    t.unit_number ? `Unit ${t.unit_number}` : '—',
    formatKSh(t.rent_amount_cents || 0),
    formatKSh(t.total_balance_cents || 0),
    t.is_active === false ? 'Terminated' : (t.property_name ? 'Active' : 'Registered')
  ]);

  autoTable(doc, {
    startY: tenantStartY + 3,
    head: [['Tenant Name', 'Phone', 'Property', 'Unit', 'Monthly Rent', 'Arrears Balance', 'Status']],
    body: tenantRows,
    headStyles: { fillColor: [30, 58, 138], fontSize: 7.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 35, font: 'courier' },
      2: { cellWidth: 55 },
      3: { cellWidth: 25 },
      4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 29, halign: 'center', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  });

  addDocumentFooter(doc);

  const dateTag = new Date().toISOString().slice(0, 10);
  doc.save(`KodiPay_Master_Report_${dateTag}.pdf`);
};
