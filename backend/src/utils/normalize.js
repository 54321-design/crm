const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normEmail(v) {
  const e = String(v ?? '').trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

// https://www.linkedin.com/in/john-doe/ , http://linkedin.com/in/john-doe?x=1 -> linkedin.com/in/john-doe
function normLinkedin(v) {
  if (!v) return null;
  let s = String(v).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^(www|[a-z]{2})\./, '').split(/[?#]/)[0].replace(/\/+$/, '');
  return s.startsWith('linkedin.com/') && s.length > 'linkedin.com/'.length ? s : null;
}

// Digits only, with country code. 10-digit numbers get DEFAULT_COUNTRY_CODE.
function normPhone(v) {
  if (!v) return null;
  const raw = String(v).trim();
  const hasPlus = raw.startsWith('+') || raw.startsWith('00');
  let d = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) d = d.slice(2);
  if (!hasPlus) {
    d = d.replace(/^0+/, '');
    if (d.length === 10) d = (process.env.DEFAULT_COUNTRY_CODE || '91') + d;
  }
  return d.length >= 8 && d.length <= 15 ? d : null;
}

module.exports = { normEmail, normLinkedin, normPhone };
