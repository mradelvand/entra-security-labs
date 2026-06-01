// @ts-check
const { themes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Entra Security Labs',
  tagline: 'Real-world identity security. Deeper than docs, deeper than exam prep.',
  favicon: 'img/favicon.ico',
  url: 'https://YOUR-GITHUB-USERNAME.github.io',
  baseUrl: '/entra-security-labs/',
  organizationName: 'YOUR-GITHUB-USERNAME',
  projectName: 'entra-security-labs',
  trailingSlash: false,
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/YOUR-GITHUB-USERNAME/entra-security-labs/edit/main/',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/social-card.png',
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Entra Security Labs',
        logo: {
          alt: 'Entra Security Labs',
          src: 'img/logo.svg',
        },
        items: [
          {
            to: '/docs/conditional-access/overview',
            label: 'Conditional Access',
            position: 'left',
          },
          {
            to: '/docs/identity-protection/overview',
            label: 'Identity Protection',
            position: 'left',
          },
          {
            to: '/docs/privileged-identity-management/overview',
            label: 'PIM',
            position: 'left',
          },
          {
            to: '/docs/authentication-methods/overview',
            label: 'Auth Methods',
            position: 'left',
          },
          {
            href: 'https://github.com/YOUR-GITHUB-USERNAME/entra-security-labs',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Series',
            items: [
              { label: 'Conditional Access', to: '/docs/conditional-access/overview' },
              { label: 'Identity Protection', to: '/docs/identity-protection/overview' },
              { label: 'PIM', to: '/docs/privileged-identity-management/overview' },
              { label: 'Authentication Methods', to: '/docs/authentication-methods/overview' },
            ],
          },
          {
            title: 'Prerequisites',
            items: [
              { label: 'azurecertprep.github.io', href: 'https://azurecertprep.github.io' },
              { label: 'SC-500 Challenges', href: 'https://azurecertprep.github.io/docs/sc-500/overview' },
              { label: 'AZ-104 Challenges', href: 'https://azurecertprep.github.io/docs/az-104/overview' },
            ],
          },
          {
            title: 'More',
            items: [
              { label: 'GitHub', href: 'https://github.com/YOUR-GITHUB-USERNAME/entra-security-labs' },
              { label: 'Report an Issue', href: 'https://github.com/YOUR-GITHUB-USERNAME/entra-security-labs/issues' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Entra Security Labs. Not affiliated with Microsoft.`,
      },
      prism: {
        theme: themes.github,
        darkTheme: themes.dracula,
        additionalLanguages: ['powershell', 'bash', 'json'],
      },
      algolia: undefined,
    }),
};

module.exports = config;
