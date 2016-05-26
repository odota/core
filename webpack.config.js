/**
 * Webpack configuration file
 **/
var webpack = require('webpack');
var config = require('./config');
var postcss = require('postcss');
const path = require('path');

module.exports = {
    entry:
    {
        'yasp': './public/js/yasp.js',
        'yaspv2': './public/js/yaspv2.js'
    },
    output:
    {
        filename: '[name].min.js',
        path: './public/build/',
        publicPath: "/public/build/"
    },
    resolve: {
      extensions: ['', '.jsx', '.js', '.css', '.json']
    },
    devtool: 'source-map',
    module:
    {
        loaders: [
            {
                test: /\.css$/,
                loader: "style-loader!css-loader?modules&importLoaders=1&localIdentName=[name]__[local]___[hash:base64:5]d!postcss-loader"
            },
            {
                test: /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: "url-loader?limit=10000&minetype=application/font-woff&name=[hash].[ext]"
            },
            {
                test: /\.(ttf|eot|svg|jpg|gif|png)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: "file-loader?name=[hash].[ext]"
            },
            {
                test: /\.(json)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: "json-loader"
            },
            {
                test: /\.(js|jsx)$/,
                exclude: /(node_modules|bower_components)/,
                loader: 'babel', // 'babel-loader' is also a legal name to reference
                // include: path.resolve(process.cwd(), 'public/js'),
                // query:
                // {
                //     presets: ['es2015', 'stage-0', 'react']
                // }
            },
            {
                test: /jquery\.js$/,
                loader: 'expose?$'
            },
            {
                test: /jquery\.js$/,
                loader: 'expose?jQuery'
            }
        ]
    },
    postcss (webpack) {
      return [
        require('postcss-import')({ addDependencyTo: webpack }),
        require('postcss-cssnext')(),
        require('postcss-browser-reporter')(),
        require('postcss-reporter')(),
      ]
    },
    devServer:
    {
        contentBase: 'public/build',
        progress: true,
        host: "0.0.0.0",
        proxy:
        {
            //api
            '/api/*':
            {
                target: config.ROOT_URL,
                secure: false,
            },
            //images
            '/apps/*':
            {
                target: config.ROOT_URL,
                secure: false,
            },
            //auth
            '/login':
            {
                target: config.ROOT_URL,
                secure: false,
            },
            '/logout':
            {
                target: config.ROOT_URL,
                secure: false,
            },
            '/return':
            {
                target: config.ROOT_URL,
                secure: false,
            },
        },
        historyApiFallback: true
    }
};
