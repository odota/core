import React from 'react'
import { Link, browserHistory } from 'react-router'
import NavBar from './NavBar';
import Container from './Container';
import Footer from './Footer';

export default function App({ children }) {
  return (
    <div className='container'>
      <NavBar />
      <Container />
      <Footer />
    </div>
  )
}