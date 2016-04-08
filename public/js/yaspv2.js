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
import Match from './components/Match';
import Player from './components/Player';
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
// Actions to dispatch by default
store.dispatch(Actions.fetchMetadata());
// Create an enhanced history that syncs navigation events with the store
const history = syncHistoryWithStore(browserHistory, store);
// Listen to route changes and dispatch the correct event
history.listen(location => console.log(location));

let reactElement = document.getElementById('react');
render(<Provider store={store}>
    { /* Tell the Router to use our enhanced history */ }
    <Router history={history}>
      <Route path="/" component={App}>
        <Route path="matches/:match_id" component={Match}>
          <Route path=":info" component={Match}/>
        </Route>
        <Route path="players/:account_id" component={Player}>
          <Route path="/:info">
            <Route path="/:subkey">
            </Route>
          </Route>
        </Route>
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