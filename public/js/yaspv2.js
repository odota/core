import React from 'react';
import
{
  render
}
from 'react-dom';
import
{
  Provider
}
from 'react-redux';
import App from './components/App';
import
{
  createStore, applyMiddleware, combineReducers
}
from 'redux';
import reducers from './reducers/reducers';
import * as Actions from './actions/actions';
import thunkMiddleware from 'redux-thunk';
import createLogger from 'redux-logger';
import
{
  Router, Route, browserHistory
}
from 'react-router';
import
{
  syncHistoryWithStore, routerReducer
}
from 'react-router-redux';
require('../../node_modules/font-awesome/css/font-awesome.css');
require('../../node_modules/dota2-minimap-hero-sprites/assets/stylesheets/dota2minimapheroes.css');
//require('../../node_modules/bootstrap/dist/css/bootstrap.css');
//require('../../node_modules/bootswatch/darkly/bootstrap.css');
//require('../css/yasp.css');
const loggerMiddleware = createLogger();
var reducer = combineReducers(Object.assign(
{},
{
  reducers: reducers,
},
{
  routing: routerReducer,
}));
var store = createStore(reducer, applyMiddleware(thunkMiddleware, // lets us dispatch() functions
  loggerMiddleware // neat middleware that logs actions
));
// Create an enhanced history that syncs navigation events with the store
const history = syncHistoryWithStore(browserHistory, store);
// Actions to dispatch by default
store.dispatch(Actions.fetchMetadata());
let reactElement = document.getElementById('react');
render(<Provider store={store}>
    { /* Tell the Router to use our enhanced history */ }
    <Router history={history}>
      <Route path="/" component={App}>
        <Route path="matches/:match_id/:info" component={App}/>
        <Route path="players/:account_id/:info/:subkey" component={App}/>
        <Route path="distributions" component={App}/>
        <Route path="carry" component={App}/>
        <Route path="picks/:n" component={App}/>
        <Route path="mmstats" component={App}/>
        <Route path="rankings/:hero_id" component={App}/>
        <Route path="benchmarks/:hero_id" component={App}/>
        <Route path="faq" component={App}/>
        <Route path="blog" component={App}/>
        <Route path="search" component={App}/>
        <Route path="status" component={App}/>
      </Route>
    </Router>
  </Provider>, reactElement);