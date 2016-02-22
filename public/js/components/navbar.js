import React from 'react';
import { connect } from 'react-redux';
import AppBar from 'material-ui/lib/app-bar';

const NavBar = () => (
  <AppBar
    title="Title"
    iconClassNameRight="muidocs-icon-navigation-expand-more"
  />
);

function mapStateToProps(input) {
  return {
    input
  }
}

export default connect(mapStateToProps)(NavBar)