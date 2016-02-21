import React from 'react'
import { render } from 'react-dom'
import { Provider } from 'react-redux'
import store from '../store'
import Todos from './todos'

let reactElement = document.getElementById('react')
render(
  <Provider store={store}>
    <Todos />
  </Provider>,
  reactElement
)