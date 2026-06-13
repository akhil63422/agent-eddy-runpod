const path = require('path');

module.exports = {
  style: {
    postcss: {
      mode: 'extends',
      loaderOptions: {
        postcssOptions: {
          config: path.resolve(__dirname, 'postcss.config.js'),
        },
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  devServer: {
    proxy: {
      '/api/v1': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        ws: true,
      },
    },
  },
};
