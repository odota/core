/**
 * Webpack configuration file
 **/
var API_URL = "https://yasp.co";
module.exports = {
    entry:
    {
        'yasp': './public/js/yasp.js',
    },
    output:
    {
        filename: '[name].min.js',
        path: './public/build/',
        publicPath: "/public/build/",
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
]
    },
};