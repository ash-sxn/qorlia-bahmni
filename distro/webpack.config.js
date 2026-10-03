const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { NxReactWebpackPlugin } = require('@nx/react/webpack-plugin');
const { InjectManifest } = require('workbox-webpack-plugin');
const webpack = require('webpack');
const { join } = require('path');

module.exports = (env, argv) => {
  //TODO to read this from docker compose
  //TODO should we hardcode?
  const publicPath =
    env.PUBLIC_PATH || process.env.PUBLIC_PATH || '/bahmni-v2/';
  const isDevelopment = argv.mode !== 'production';
  const backendOrigin = process.env.BAHMNI_API_ORIGIN || 'https://localhost/';
  const standardConfigRef = process.env.BAHMNI_STANDARD_CONFIG_REF;
  if (standardConfigRef && !/^[a-f0-9]{40}$/i.test(standardConfigRef)) {
    throw new Error(
      'BAHMNI_STANDARD_CONFIG_REF must be a pinned 40-character commit SHA',
    );
  }

  return {
    output: {
      path: join(__dirname, 'dist'),
      publicPath: publicPath,
      clean: true,
    },
    resolve: {
      alias: isDevelopment
        ? {
            '@bahmni/services$': join(
              __dirname,
              '../packages/bahmni-services/src',
            ),
            '@bahmni/design-system$': join(
              __dirname,
              '../packages/bahmni-design-system/src',
            ),
            '@bahmni/widgets$': join(
              __dirname,
              '../packages/bahmni-widgets/src',
            ),
            '@bahmni/home-app': join(__dirname, '../apps/home/src'),
            '@bahmni/clinical-app': join(__dirname, '../apps/clinical/src'),
            '@bahmni/registration-app': join(
              __dirname,
              '../apps/registration/src',
            ),
            '@bahmni/appointments-app': join(
              __dirname,
              '../apps/appointments/src',
            ),
            '@bahmni/command-palette-app': join(
              __dirname,
              '../apps/command-palette/src',
            ),
            '@bahmni/patient-documents-app': join(
              __dirname,
              '../apps/patient-documents/src',
            ),
            '@bahmni/admin-app': join(__dirname, '../apps/admin/src'),
            '@bahmni/reports-app': join(__dirname, '../apps/reports/src'),
          }
        : {},
    },
    devServer: {
      host: '127.0.0.1',
      allowedHosts: ['127.0.0.1', 'localhost'],
      port: 3000,
      setupMiddlewares: (middlewares, devServer) => {
        devServer.app.get(
          ['/', '/bahmni/home', '/bahmni/home/', '/bahmni/home/index.html'],
          (request, response) => {
            response.set('Cache-Control', 'no-store');
            response.redirect(
              302,
              request.path === '/' ? '/bahmni-v2/home/' : '/bahmni-v2/login',
            );
          },
        );
        return middlewares;
      },
      historyApiFallback: {
        index: '/bahmni-v2/index.html',
        disableDotRule: true,
        htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
      },
      proxy: [
        ...(standardConfigRef
          ? [
              {
                context: (pathname) =>
                  /^\/bahmni_config\/openmrs\/apps\/[^/]+\/v2\//.test(pathname),
                target: 'https://raw.githubusercontent.com',
                pathRewrite: {
                  '^/bahmni_config': `/Bahmni/standard-config/${standardConfigRef}`,
                },
                changeOrigin: true,
                secure: true,
              },
            ]
          : []),
        {
          context: (pathname) => !pathname.startsWith(publicPath),
          target: backendOrigin,
          changeOrigin: true,
          secure: backendOrigin !== 'https://localhost/',
          cookieDomainRewrite: { '*': '' },
          logLevel: 'debug',
          onProxyRes: (proxyResponse, request) => {
            // Keep API authentication failures in the React login flow,
            // instead of opening a second, browser-owned Basic auth dialog.
            if (
              proxyResponse.statusCode === 401 &&
              request.url.startsWith('/openmrs/ws/')
            ) {
              delete proxyResponse.headers['www-authenticate'];
            }
          },
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.PUBLIC_URL': JSON.stringify(publicPath),
        'process.env.PUBLIC_PATH': JSON.stringify(publicPath),
      }),
      new NxAppWebpackPlugin({
        tsConfig: './tsconfig.app.json',
        compiler: 'babel',
        main: './src/main.tsx',
        index: './src/index.html',
        baseHref: publicPath,
        assets: [
          './src/assets',
          {
            input: isDevelopment
              ? '../apps/home/public/locales'
              : '../apps/home/dist/locales',
            glob: '**/*',
            output: 'home/locales',
          },
          {
            input: isDevelopment
              ? '../apps/clinical/public/locales'
              : '../apps/clinical/dist/locales',
            glob: '**/*',
            output: 'clinical/locales',
          },
          {
            input: isDevelopment
              ? '../apps/registration/public/locales'
              : '../apps/registration/dist/locales',
            glob: '**/*',
            output: 'registration/locales',
          },
          {
            input: isDevelopment
              ? '../apps/appointments/public/locales'
              : '../apps/appointments/dist/locales',
            glob: '**/*',
            output: 'appointments/locales',
          },
          {
            input: isDevelopment
              ? '../apps/command-palette/public/locales'
              : '../apps/command-palette/dist/locales',
            glob: '**/*',
            output: 'command-palette/locales',
          },
          {
            input: isDevelopment
              ? '../apps/patient-documents/public/locales'
              : '../apps/patient-documents/dist/locales',
            glob: '**/*',
            output: 'document-upload/locales',
          },
          {
            input: isDevelopment
              ? '../apps/admin/public/locales'
              : '../apps/admin/dist/locales',
            glob: '**/*',
            output: 'admin/locales',
          },
          {
            input: isDevelopment
              ? '../apps/reports/public/locales'
              : '../apps/reports/dist/locales',
            glob: '**/*',
            output: 'reports/locales',
          },
        ],
        styles: ['./src/styles.scss'],
        outputHashing:
          process.env['NODE_ENV'] === 'production' ? 'all' : 'none',
        optimization: process.env['NODE_ENV'] === 'production',
      }),
      new NxReactWebpackPlugin({
        // Uncomment this line if you don't want to use SVGR
        // See: https://react-svgr.com/
        // svgr: false
      }),
      ...(!isDevelopment
        ? [
            new InjectManifest({
              swSrc: join(__dirname, 'src/service-worker.ts'),
              swDest: 'service-worker.js',
              maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
              exclude: [/\.map$/, /^manifest.*\.js$/],
            }),
          ]
        : []),
    ],
  };
};
