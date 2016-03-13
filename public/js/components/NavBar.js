import React from 'react';
import { connect } from 'react-redux';
import AppBar from 'material-ui/lib/app-bar';

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
         <li>
            <a href="/distributions">Distributions</a>
         </li>
         <li>
            <a href="/picks">Picks</a>
         </li>
         <li>
            <a href="/mmstats">MMStats</a>
         </li>
         <li>
            <a href="/faq">FAQ</a>
         </li>
         <li>
            <a href="/blog">Blog</a>
         </li>
         <li>
            <a href="/status">Status</a>
         </li>
         <li>
            <a href="/carry">Carry</a>
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

/*
<AppBar
    title="Title"
    iconClassNameRight="muidocs-icon-navigation-expand-more"
  />
*/

function mapStateToProps(input) {
  return {
    input
  }
}

export default connect(mapStateToProps)(NavBar)