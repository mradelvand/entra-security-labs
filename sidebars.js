/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'category',
      label: '🏛️ AZ-104 · Identities & Governance',
      link: { type: 'doc', id: 'az-104-identities-governance/overview' },
      items: [
        'az-104-identities-governance/02-rbac-access-management',
      ],
    },
    {
      type: 'category',
      label: '🔐 Conditional Access',
      link: { type: 'doc', id: 'conditional-access/overview' },
      items: [
        'conditional-access/01-troubleshooting-ca-with-audit-logs',
        'conditional-access/02-report-only-mode-playbook',
        'conditional-access/03-named-locations-deep-dive',
        'conditional-access/04-service-account-exclusions',
      ],
    },
    {
      type: 'category',
      label: '🛡️ Identity Protection',
      link: { type: 'doc', id: 'identity-protection/overview' },
      items: [
        'identity-protection/01-risk-based-ca-gaps',
      ],
    },
    {
      type: 'category',
      label: '👑 Privileged Identity Management',
      link: { type: 'doc', id: 'privileged-identity-management/overview' },
      items: [],
    },
    {
      type: 'category',
      label: '🔑 Authentication Methods',
      link: { type: 'doc', id: 'authentication-methods/overview' },
      items: [],
    },
  ],
};

module.exports = sidebars;
