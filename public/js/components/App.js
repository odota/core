import React from 'react';
import { Link, browserHistory } from 'react-router';
import NavBar from './NavBar';
import Container from './Container';
import Footer from './Footer';
import AppBar from 'material-ui/AppBar';
import Navigation from './Navigation';
import Match from './Match';
import Player from './Player';

export default function App({ children }) {
  return (
      <div className='container'>
        <NavBar />
        { children }
        <Footer />
      </div>
  );
}