import React from 'react'
import { render } from 'react-dom'
import { Provider } from 'react-redux'
import NavBar from './navbar'
import Container from './container'
import Footer from './footer'
import { createStore } from 'redux';
import reducer from '../reducers/reducer'
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
)