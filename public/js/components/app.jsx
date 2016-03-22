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
import NavBar from './NavBar';
import Container from './Container';
import Footer from './Footer';
import
{
  createStore, applyMiddleware
}
from 'redux';
import reducer from '../reducers/reducers';
import * as Actions from '../actions/actions';
import thunkMiddleware from 'redux-thunk';
import createLogger from 'redux-logger';
require('../../../node_modules/font-awesome/css/font-awesome.css');
require('../../../node_modules/dota2-minimap-hero-sprites/assets/stylesheets/dota2minimapheroes.css');
require('../../../node_modules/bootstrap/dist/css/bootstrap.css');
require('../../../node_modules/bootswatch/darkly/bootstrap.css');
require('../../css/yasp.css');
const loggerMiddleware = createLogger();
var initialState = {
  match:{data : {}},
  player:{data : {}},
  user:{data : {}},
  navbar:{data: []},
  cheese:{data: {}}
};
var store = createStore(reducer, initialState, applyMiddleware(thunkMiddleware, // lets us dispatch() functions
  loggerMiddleware // neat middleware that logs actions
));
store.dispatch(Actions.fetchNavbar());
store.dispatch(Actions.fetchUser());
store.dispatch(Actions.fetchCheese());
//TODO react router to handle link clicks and make more dispatches?
let reactElement = document.getElementById('react');
render(<Provider store={store}>
    <div>
      <NavBar />
      <Container />
      <Footer />
    </div>
  </Provider>, reactElement);