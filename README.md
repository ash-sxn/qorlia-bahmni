# Qorlia contributor guide

New to Qorlia? Start with the [current Qorlia README and learning path](https://github.com/ash-sxn/qorlia-bahmni/blob/codex/billing-delivery-parity/README.md). It links to beginner setup, architecture, repository/module maps, API integration, design rules, testing, contribution workflow and team task templates.

The application redesign is on development branches, not this older default `main` baseline. Read the [first contribution walkthrough](https://github.com/ash-sxn/qorlia-bahmni/blob/codex/billing-delivery-parity/docs/first-contribution.md), then confirm your task's approved base and synthetic access before coding. Reading the development documentation does not authorize merging or deploying unfinished application code.

The upstream README below is retained for reference. Use the linked Qorlia guide for current setup, feature status and contribution instructions. Upstream copyright and licences remain unchanged.

# Bahmni Apps Frontend

A React TypeScript monorepo application for Bahmni applications, built with Nx, Webpack, and Carbon Design System. This application includes PWA support for offline capabilities.

# About Bahmni
Bahmni is an open-source healthcare information system designed to serve healthcare providers in resource-limited settings. It combines electronic medical records (EMR), hospital information management, and clinical workflows into a unified platform. Bahmni is built on OpenMRS and focuses on making healthcare delivery more efficient and patient-centric. The platform follows FHIR (Fast Healthcare Interoperability Resources) standards to ensure interoperability with other healthcare systems.   

## Features

- **React** - UI library for building user interfaces
- **Carbon Design System** - IBM's open-source design system
- **Webpack** - Module bundler for modern JavaScript applications
- **React Router** - Declarative routing for React applications
- **i18n Support** - Internationalization for multiple languages
- **Display Controls** - Reusable clinical data visualization components

## Prerequisites

- Node.js (v18.x or later recommended)
- Yarn (v1.22.x or later recommended)

## Getting Started

### Installation

```bash
# Install dependencies
yarn
```

### Detailed Setup Guide

For a comprehensive setup guide including development environments, Docker configuration, authentication setup, and troubleshooting, please refer to our [Setup Guide](docs/setup-guide.md).

### Additional Documentation

- [Frontend Architecture](docs/architecture.md) - A comprehensive overview of the Bahmni Apps Frontend architecture
- [Project Structure](docs/project-structure.md) - A high-level overview of the project structure
- [i18n Guide](docs/i18n-guide.md) - Internationalization implementation details
- [Sortable Data Table Guide](docs/sortable-data-table-guide.md) - Usage of the sortable data table component
- [Global Notification Guide](docs/global-notification-guide.md) - Using the notification system

### Building for Production

```bash
# Build the application
yarn build 
```

The build artifacts will be stored in the `dist/` directory.

### Development

```bash
# Start the development server
yarn nx serve distro
```

This will start the development server at [http://localhost:3000](http://localhost:3000).

### Linting

```bash
# Run ESLint to check for code quality issues
yarn lint

# Fix ESLint issues automatically
yarn lint:fix
```

For a more detailed explanation of the project structure and architecture, see [Architecture Documentation](docs/architecture.md) and [Project Structure Documentation](docs/project-structure.md).

## Scripts

- `yarn dev` - Start the development server
- `yarn build` - Build the application for production
- `yarn test` - Run tests
- `yarn test:watch` - Run tests in watch mode
- `yarn test:coverage` - Run tests with coverage report
- `yarn lint` - Run ESLint to check for code quality issues
- `yarn lint:fix` - Fix ESLint issues automatically
- `yarn format` - Format code with Prettier

## Technologies

- [React](https://react.dev/) - UI library
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Carbon Design System](https://carbondesignsystem.com/) - IBM's design system
- [Webpack](https://webpack.js.org/) - Module bundler
- [React Router](https://reactrouter.com/) - Routing library
- [i18next](https://www.i18next.com/) - Internationalization framework
- [Jest](https://jestjs.io/) - Testing framework
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) - React testing utilities
- [ESLint](https://eslint.org/) - Code quality tool
- [Prettier](https://prettier.io/) - Code formatter
- [Workbox](https://developers.google.com/web/tools/workbox) - PWA tooling

## License

[Add license information here]
