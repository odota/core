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
      : 
      Object.keys(input.data.navbar_pages).map(page =>
      <li><a href={'/'+page}>{input.data.navbar_pages[page].name}</a></li>
      )
      }
      </ul>
      <ul className="nav navbar-nav navbar-right">
      {
      input.isFetching ?
      <li><i className="fa fa-spinner fa-spin"></i></li>
      :
      input.data.user ?
         <span>
         <li>
         <a href={"/players/"+input.data.user.account_id}>Profile</a>
         </li>
         <li>
            <a href="/logout">Logout</a>
         </li>
         </span>
      :
         <li>
            <a href="/login">Login</a>
         </li>      
      }
      </ul>
   </div>
</div>);

function mapStateToProps(state)
{
   return state.reducers.metadata;
}
export default connect(mapStateToProps)(NavBar);