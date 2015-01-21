if (process.env.RETRIEVER) {
    require('./retriever');
}
else {
    require('./yasp');
}