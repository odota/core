import React from 'react'
import { connect } from 'react-redux'
import NavBar from './navbar'
import Container from './container'
import Footer from './footer'

const Base = () => (
  <div>
    <NavBar />
    <Container />
    <Footer />
  </div>
);

export default connect()(Base)