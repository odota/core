import React from 'react'
import { render } from 'react-dom'
import { Provider } from 'react-redux'
import store from '../store'
import Base from './base'

let reactElement = document.getElementById('react');

render(
  <Provider store={store}>
    <Base />
  </Provider>,
  reactElement
)