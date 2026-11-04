import React from 'react';

// 1) n8n form ka PRODUCTION URL yahan daalo (/form/..., na ki /form-test/...)
const FORM_URL = 'https://n8n.digibirds360.com/form/b37e75ef-d1c2-42ea-9825-54e69d5540ce';

// 2) Logo file ko client/public/ mein rakho (jaise client/public/digibirds-logo.png)
const LOGO_SRC = '/digibirds-logo.png';

const styles = {
  page: { maxWidth: 760, margin: '0 auto', padding: '8px 0 40px' },
  head: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  logo: { height: 44, width: 'auto', display: 'block' },
  title: { margin: 0, fontSize: 28, fontWeight: 700, color: '#10231c' },
  sub: { margin: '4px 0 0', fontSize: 15, color: '#5b6b63' },
  card: {
    background: '#fff',
    border: '1px solid #e3e6df',
    borderRadius: 16,
    overflow: 'hidden',
  },
  frame: { width: '100%', height: 820, border: 0, display: 'block' },
  foot: { marginTop: 12, fontSize: 13, color: '#5b6b63' },
  link: { color: '#1b7a57', fontWeight: 600 },
};

export default function FindLeads() {
  return (
    <div style={styles.page}>
      <div style={styles.head}>
        <img
          src={LOGO_SRC}
          alt="DigiBirds360"
          style={styles.logo}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div>
          <h1 style={styles.title}>Find leads</h1>
          <p style={styles.sub}>Search Google Maps for businesses and add them to your leads.</p>
        </div>
      </div>

      <div style={styles.card}>
        <iframe title="Google Maps lead scraper" src={FORM_URL} style={styles.frame} />
      </div>

      <p style={styles.foot}>
        Form not loading?{' '}
        <a href={FORM_URL} target="_blank" rel="noreferrer" style={styles.link}>
          Open it in a new tab
        </a>
      </p>
    </div>
  );
}
