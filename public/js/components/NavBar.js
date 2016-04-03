import React from 'react';
import
{
   connect
}
from 'react-redux';
const NavBar = (input) => (<div style={{marginBottom:"0px"}} className="navbar">
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
      {
      input.isFetching ? 
      <li><i className="fa fa-spinner fa-spin"></i></li>
      : Object.keys(input.data).map(page =>
      <li><a href={'/'+page}>{input.data[page].name}</a></li>
      )
      }
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
</div>);

function mapStateToProps(state)
{
   return state.reducers.navbar;
}
export default connect(mapStateToProps)(NavBar);