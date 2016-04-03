var webpack = require('webpack');
var config = require('./config');
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
    module:
    {
        loaders: [
            {
                test: /\.css$/,
                loader: "style-loader!css-loader"
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
                test: /jquery\.js$/,
                loader: 'expose?$'
            },
            {
                test: /jquery\.js$/,
                loader: 'expose?jQuery'
            },
            {
                test: /\.jsx?$/,
                exclude: /(node_modules|bower_components)/,
                loader: 'babel', // 'babel-loader' is also a legal name to reference
                query:
                {
                    presets: ['react', 'es2015']
                }
            }
        ]
    },
    devServer:
    {
        contentBase: 'public/build',
        progress: true,
        host: "0.0.0.0",
        proxy:
        {
            '/api/*':
            {
                target: config.ROOT_URL,
                secure: false,
            },
            '/apps/*':
            {
                target: config.ROOT_URL,
                secure: false,
            }
        },
        historyApiFallback: true
    }
};