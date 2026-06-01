import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

const SERIES = [
  {
    icon: '🔐',
    title: 'Conditional Access',
    desc: 'Incident investigations, policy misconfigurations, service account blindspots, and audit log forensics.',
    to: '/docs/conditional-access/overview',
    count: 4,
    active: true,
  },
  {
    icon: '🛡️',
    title: 'Identity Protection',
    desc: 'Risk-based CA gaps, detection edge cases, and remediation patterns that docs don\'t cover.',
    to: '/docs/identity-protection/overview',
    count: 1,
    active: true,
  },
  {
    icon: '👑',
    title: 'Privileged Identity Management',
    desc: 'PIM activation failures, role assignment forensics, and approval workflow edge cases.',
    to: '/docs/privileged-identity-management/overview',
    count: 0,
    active: false,
  },
  {
    icon: '🔑',
    title: 'Authentication Methods',
    desc: 'MFA registration gaps, SSPR misconfigurations, and phishing-resistant auth rollouts.',
    to: '/docs/authentication-methods/overview',
    count: 0,
    active: false,
  },
];

const PHILOSOPHY = [
  {
    icon: '🔬',
    title: 'Deeper than docs',
    desc: 'Microsoft docs tell you what. This repo tells you why it broke and what to do next time.',
  },
  {
    icon: '🎯',
    title: 'Intermediate and up',
    desc: 'Not a beginner tutorial. Every post assumes you\'ve done the hands-on foundation first.',
  },
  {
    icon: '🔗',
    title: 'Hybrid strategy',
    desc: 'Each post links to azurecertprep for prerequisites — then goes deeper with real-world content.',
  },
  {
    icon: '⚡',
    title: 'Exam-aligned',
    desc: 'Every post maps to SC-300, AZ-500, and MS-102 skill areas. Learn and prep simultaneously.',
  },
];

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <div className="page-wrapper">

        {/* Hero */}
        <div className="hero-section">
          <h1>Entra Security Labs</h1>
          <p>{siteConfig.tagline}</p>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-num">5+</span>
              <span className="hero-stat-label">Posts</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-num">4</span>
              <span className="hero-stat-label">Series</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-num">3</span>
              <span className="hero-stat-label">Exam certs</span>
            </div>
          </div>
          <div>
            <Link className="hero-cta" to="/docs/conditional-access/overview">
              Start with Conditional Access →
            </Link>
            <a
              className="hero-cta-secondary"
              href="https://github.com/mradelvand/entra-security-labs"
              target="_blank"
              rel="noreferrer"
            >
              ⭐ GitHub
            </a>
          </div>
        </div>

        {/* Philosophy */}
        <div className="philosophy-section">
          <div className="philosophy-grid">
            {PHILOSOPHY.map((item) => (
              <div className="philosophy-item" key={item.title}>
                <span className="philosophy-item-icon">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Series grid */}
        <div style={{ padding: '0 2rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <div className="section-label">Content</div>
          <div className="section-title">Lab Series</div>
          <div className="section-sub">
            Each series goes deeper than certification prep. Start with a foundation from{' '}
            <a href="https://azurecertprep.github.io" target="_blank" rel="noreferrer" style={{ color: '#378ADD' }}>
              azurecertprep
            </a>
            , then come back here.
          </div>
        </div>

        <div className="series-grid">
          {SERIES.map((s) => (
            <Link className="series-card" to={s.to} key={s.title}>
              <span className="series-card-icon">{s.icon}</span>
              <div className="series-card-title">{s.title}</div>
              <div className="series-card-desc">{s.desc}</div>
              <div className="series-card-meta">
                {s.active && s.count > 0 ? (
                  <span className="badge-post-count">{s.count} post{s.count !== 1 ? 's' : ''}</span>
                ) : (
                  <span className="badge-coming-soon">Coming soon</span>
                )}
              </div>
            </Link>
          ))}
        </div>

      </div>
    </Layout>
  );
}
