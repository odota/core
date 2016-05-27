/**
 * Webpack configuration file
 **/
var API_URL = "https://yasp.co";
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
        port: 5000,
        proxy:
        {
            //api
            '/api/*':
            {
                target: API_URL,
                secure: false,
                changeOrigin: true,
            },
            //images
            '/apps/*':
            {
                target: API_URL,
                secure: false,
                changeOrigin: true,
            },
            //auth
            '/login':
            {
                target: API_URL,
                secure: false,
                changeOrigin: true,
            },
            '/logout':
            {
                target: API_URL,
                secure: false,
                changeOrigin: true,
            },
            '/return':
            {
                target: API_URL,
                secure: false,
                changeOrigin: true,
            },
        },
        historyApiFallback: true
    }
};