import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import NavBar from './NavBar';
import Container from './Container';
import Footer from './Footer';
import { createStore } from 'redux';
import reducer from '../reducers/reducer';
require('../../../node_modules/font-awesome/css/font-awesome.css');
require('../../../node_modules/dota2-minimap-hero-sprites/assets/stylesheets/dota2minimapheroes.css');
require('../../../node_modules/bootstrap/dist/css/bootstrap.css');
require('../../../node_modules/bootswatch/darkly/bootstrap.css');
require('../../css/yasp.css');

var store = createStore(reducer);

let reactElement = document.getElementById('react');

render(
  <Provider store={store}>
    <div>
      <NavBar />
      <Container />
      <Footer />
    </div>
  </Provider>,
  reactElement
);