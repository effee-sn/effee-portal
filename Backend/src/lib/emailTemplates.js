const prisma = require('./prisma');

async function getCompanyName() {
  const s = await prisma.companySettings.findFirst();
  return s?.company_name || 'Effee Portal';
}

function baseTemplate(companyName, content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
    .header { background: #1e40af; padding: 24px 32px; }
    .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .header p  { color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px; }
    .body { padding: 28px 32px; }
    .body p { color: #374151; font-size: 14px; line-height: 1.65; margin: 0 0 14px; }
    .status-box { border-radius: 8px; padding: 14px 18px; margin: 18px 0; }
    .status-approved { background: #f0fdf4; border-left: 4px solid #22c55e; color: #166534; }
    .status-rejected { background: #fef2f2; border-left: 4px solid #ef4444; color: #991b1b; }
    .status-pending  { background: #eff6ff; border-left: 4px solid #3b82f6; color: #1e40af; }
    .status-box strong { display: block; font-size: 13px; font-weight: 700; margin-bottom: 3px; }
    .detail-table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13px; }
    .detail-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
    .detail-table td:first-child { color: #64748b; font-weight: 600; width: 40%; }
    .detail-table td:last-child  { color: #0f172a; font-weight: 500; }
    .footer { background: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; }
    .footer p { color: #94a3b8; font-size: 11.5px; margin: 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${companyName}</h1>
      <p>Expense Management System</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>This is an automated message from ${companyName}. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Reimbursement submitted ────────────────────────────────────────────────────
async function reimbursementSubmitted({ to, userName, title, amount, code }) {
  const company = await getCompanyName();
  const content = `
    <p>Hi,</p>
    <p><strong>${userName}</strong> has submitted a new reimbursement request that requires your approval.</p>
    <table class="detail-table">
      <tr><td>Reference</td><td>${code || '—'}</td></tr>
      <tr><td>Title</td><td>${title}</td></tr>
      <tr><td>Amount</td><td>₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
    </table>
    <div class="status-box status-pending">
      <strong>Action Required</strong>
      Please log in to review and approve or reject this request.
    </div>`;
  return { to, subject: `New Reimbursement Request — ${title}`, html: baseTemplate(company, content) };
}

// ── Reimbursement approved by manager ─────────────────────────────────────────
async function reimbursementApproved({ to, userName, title, amount, code, notes }) {
  const company = await getCompanyName();
  const content = `
    <p>Hi ${userName},</p>
    <p>Your reimbursement request has been <strong>approved</strong> by your manager and is now pending finance review.</p>
    <table class="detail-table">
      <tr><td>Reference</td><td>${code || '—'}</td></tr>
      <tr><td>Title</td><td>${title}</td></tr>
      <tr><td>Amount</td><td>₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      ${notes ? `<tr><td>Notes</td><td>${notes}</td></tr>` : ''}
    </table>
    <div class="status-box status-approved">
      <strong>Manager Approved</strong>
      Your request is now with the finance team for final processing.
    </div>`;
  return { to, subject: `Reimbursement Approved — ${title}`, html: baseTemplate(company, content) };
}

// ── Reimbursement rejected ─────────────────────────────────────────────────────
async function reimbursementRejected({ to, userName, title, amount, code, notes, rejectedBy }) {
  const company = await getCompanyName();
  const content = `
    <p>Hi ${userName},</p>
    <p>Your reimbursement request has been <strong>rejected</strong>${rejectedBy ? ` by ${rejectedBy}` : ''}.</p>
    <table class="detail-table">
      <tr><td>Reference</td><td>${code || '—'}</td></tr>
      <tr><td>Title</td><td>${title}</td></tr>
      <tr><td>Amount</td><td>₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      ${notes ? `<tr><td>Reason</td><td>${notes}</td></tr>` : ''}
    </table>
    <div class="status-box status-rejected">
      <strong>Request Rejected</strong>
      Please review the reason above and submit a new request with the necessary corrections.
    </div>`;
  return { to, subject: `Reimbursement Rejected — ${title}`, html: baseTemplate(company, content) };
}

// ── Reimbursement finance approved ────────────────────────────────────────────
async function reimbursementFinanceApproved({ to, userName, title, amount, code, paymentMode, paymentRef }) {
  const company = await getCompanyName();
  const content = `
    <p>Hi ${userName},</p>
    <p>Your reimbursement request has been <strong>fully processed</strong> by the finance team.</p>
    <table class="detail-table">
      <tr><td>Reference</td><td>${code || '—'}</td></tr>
      <tr><td>Title</td><td>${title}</td></tr>
      <tr><td>Amount</td><td>₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      ${paymentMode ? `<tr><td>Payment Mode</td><td>${paymentMode}</td></tr>` : ''}
      ${paymentRef  ? `<tr><td>Reference No.</td><td>${paymentRef}</td></tr>` : ''}
    </table>
    <div class="status-box status-approved">
      <strong>Payment Processed</strong>
      Your reimbursement has been completed successfully.
    </div>`;
  return { to, subject: `Reimbursement Processed — ${title}`, html: baseTemplate(company, content) };
}

// ── Advance submitted ──────────────────────────────────────────────────────────
async function advanceSubmitted({ to, userName, title, amount, code }) {
  const company = await getCompanyName();
  const content = `
    <p>Hi,</p>
    <p><strong>${userName}</strong> has submitted a new advance request that requires your approval.</p>
    <table class="detail-table">
      <tr><td>Reference</td><td>${code || '—'}</td></tr>
      <tr><td>Title</td><td>${title}</td></tr>
      <tr><td>Amount</td><td>₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
    </table>
    <div class="status-box status-pending">
      <strong>Action Required</strong>
      Please log in to review and approve or reject this advance request.
    </div>`;
  return { to, subject: `New Advance Request — ${title}`, html: baseTemplate(company, content) };
}

// ── Advance approved ───────────────────────────────────────────────────────────
async function advanceApproved({ to, userName, title, amount, code, notes }) {
  const company = await getCompanyName();
  const content = `
    <p>Hi ${userName},</p>
    <p>Your advance request has been <strong>approved</strong> by your manager and is now pending finance disbursement.</p>
    <table class="detail-table">
      <tr><td>Reference</td><td>${code || '—'}</td></tr>
      <tr><td>Title</td><td>${title}</td></tr>
      <tr><td>Amount</td><td>₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      ${notes ? `<tr><td>Notes</td><td>${notes}</td></tr>` : ''}
    </table>
    <div class="status-box status-approved">
      <strong>Manager Approved</strong>
      Your advance is now with the finance team for disbursement.
    </div>`;
  return { to, subject: `Advance Approved — ${title}`, html: baseTemplate(company, content) };
}

// ── Advance rejected ───────────────────────────────────────────────────────────
async function advanceRejected({ to, userName, title, amount, code, notes, rejectedBy }) {
  const company = await getCompanyName();
  const content = `
    <p>Hi ${userName},</p>
    <p>Your advance request has been <strong>rejected</strong>${rejectedBy ? ` by ${rejectedBy}` : ''}.</p>
    <table class="detail-table">
      <tr><td>Reference</td><td>${code || '—'}</td></tr>
      <tr><td>Title</td><td>${title}</td></tr>
      <tr><td>Amount</td><td>₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      ${notes ? `<tr><td>Reason</td><td>${notes}</td></tr>` : ''}
    </table>
    <div class="status-box status-rejected">
      <strong>Request Rejected</strong>
      Please review the reason above and submit a new request if needed.
    </div>`;
  return { to, subject: `Advance Rejected — ${title}`, html: baseTemplate(company, content) };
}

// ── Advance disbursed ──────────────────────────────────────────────────────────
async function advanceDisbursed({ to, userName, title, amount, code, paymentMode, paymentRef }) {
  const company = await getCompanyName();
  const content = `
    <p>Hi ${userName},</p>
    <p>Your advance request has been <strong>disbursed</strong> by the finance team.</p>
    <table class="detail-table">
      <tr><td>Reference</td><td>${code || '—'}</td></tr>
      <tr><td>Title</td><td>${title}</td></tr>
      <tr><td>Amount</td><td>₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      ${paymentMode ? `<tr><td>Payment Mode</td><td>${paymentMode}</td></tr>` : ''}
      ${paymentRef  ? `<tr><td>Reference No.</td><td>${paymentRef}</td></tr>` : ''}
    </table>
    <div class="status-box status-approved">
      <strong>Advance Disbursed</strong>
      Please ensure you submit your settlement within the stipulated time.
    </div>`;
  return { to, subject: `Advance Disbursed — ${title}`, html: baseTemplate(company, content) };
}

// ── Forgot password ────────────────────────────────────────────────────────────
async function forgotPassword({ to, userName, resetUrl }) {
  const company = await getCompanyName();
  const content = `
    <p>Hi ${userName},</p>
    <p>We received a request to reset your password. Click the button below to set a new password:</p>
    <div style="text-align:center; margin: 28px 0;">
      <a href="${resetUrl}" style="display:inline-block; background:#1e40af; color:#fff; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:600; text-decoration:none;">
        Reset Password
      </a>
    </div>
    <p style="color:#64748b; font-size:13px;">This link expires in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email — your account is safe.</p>
    <p style="color:#64748b; font-size:12px; word-break:break-all;">Or paste this link in your browser: ${resetUrl}</p>`;
  return { to, subject: `Reset Your Password — ${company}`, html: baseTemplate(company, content) };
}

module.exports = {
  reimbursementSubmitted,
  reimbursementApproved,
  reimbursementRejected,
  reimbursementFinanceApproved,
  advanceSubmitted,
  advanceApproved,
  advanceRejected,
  advanceDisbursed,
  forgotPassword,
};
