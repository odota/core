import React from 'react'
import { render } from 'react-dom'
import { Provider } from 'react-redux'
import store from '../store'
import NavBar from './navbar'
import Container from './container'
import Footer from './footer'

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