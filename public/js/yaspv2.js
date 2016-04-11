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
import Home from './components/Home';
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
  Router, Route, browserHistory, IndexRoute
}
from 'react-router';
import
{
  syncHistoryWithStore, routerReducer
}
from 'react-router-redux';
// Load CSS
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
// Fetch metadata (used on all pages)
store.dispatch(Actions.fetchMetadata());
// Create an enhanced history that syncs navigation events with the store
const history = syncHistoryWithStore(browserHistory, store);
//history.listen(function(location) {Actions.routeChange(location)});
let reactElement = document.getElementById('react');
render(<Provider store={store}>
    { /* Tell the Router to use our enhanced history */ }
    <Router history={history}>
      <Route path="/" component={App}>
        <IndexRoute component={Home} />
        <Route path="matches/:match_id" component={Match}>
          <Route path=":info"/>
        </Route>
        <Route path="players/:account_id" component={Player}>
          <Route path="/:info">
            <Route path="/:subkey">
            </Route>
          </Route>
        </Route>
      </Route>
    </Router>
  </Provider>, reactElement);
/*
<Route path="distributions" component={Distribution}/>
<Route path="carry" component={Carry}/>
<Route path="picks/:n" component={Picks}/>
<Route path="mmstats" component={MMStats}/>
<Route path="rankings/:hero_id" component={Ranking}/>
<Route path="benchmarks/:hero_id" component={Benchmark}/>
<Route path="faq" component={FAQ}/>
<Route path="blog" component={Blog}/>
<Route path="search" component={Search}/>
<Route path="status" component={Status}/>
*/