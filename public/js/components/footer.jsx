import React from 'react'
import { connect } from 'react-redux'

const Footer = () => (
  <div
    title="Footer"
  />
);

function mapStateToProps(input) {
  return {
    input
  }
}

export default connect(mapStateToProps)(Footer)