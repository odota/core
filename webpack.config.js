var webpack = require('webpack');
module.exports = {
    entry:
    {
        'yasp': './public/js/yasp.js',
        'yaspv2': './public/js/components/app.jsx'
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
    }
};