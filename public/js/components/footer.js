import React from 'react'
import { connect } from 'react-redux'

const Footer = () => (
  <div>Footer</div>
);

function mapStateToProps(input) {
  return {
    input
  }
}

export default connect(mapStateToProps)(Footer)

//document.body.style["margin-bottom"] = document.getElementById('footer').clientHeight;
//tooltips();
//formatHtml();