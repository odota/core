import React from 'react';
import { connect } from 'react-redux';

const NavBar = () => (
<div style={{marginBottom:"0px"}} className="navbar">
   <div className="navbar-header">
      <a href="/" className="navbar-brand">
         <strong className="theme-blue">YASP</strong>
         <a data-toggle="collapse" data-target=".navbar-collapse" className="navbar-toggle">
            <span className="icon-bar" />
            <span className="icon-bar" />
            <span className="icon-bar" />
         </a>
      </a>
   </div>
   <div id="navbar" className="navbar-collapse collapse">
      <ul className="nav navbar-nav">
         <li>
            <a href="/request">Request</a>
         </li>
      </ul>
      <ul className="nav navbar-nav navbar-right">
         <li>
            <a href="/players/88367253">Profile</a>
         </li>
         <li>
            <a href="/logout">Logout</a>
         </li>
      </ul>
   </div>
</div>
);

function mapStateToProps(input) {
  return {
    input
  };
}

export default connect(mapStateToProps)(NavBar);