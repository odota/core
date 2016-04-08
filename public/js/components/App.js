import React from 'react'
import { Link, browserHistory } from 'react-router'
import NavBar from './NavBar';
import Container from './Container';
import Footer from './Footer';
import AppBar from 'material-ui/lib/app-bar';
import Navigation from './Navigation'
import injectTapEventPlugin from 'react-tap-event-plugin';

// Needed for onTouchTap
// Can go away when react 1.0 release
// Check this repo:
// https://github.com/zilverline/react-tap-event-plugin
injectTapEventPlugin();

export default function App({ children }) {
  return (
    <div>
      <div className='container'>
        <AppBar/>
        <Navigation />
        //<NavBar />
        <Container />
        <Footer />
      </div>
    </div>
  )
}