import React from 'react';
import
{
   connect
}
from 'react-redux';
const NavBar = (props) => (<div style={{marginBottom:"0px"}} className="navbar">
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
      props.isFetching ? 
      <li><i className="fa fa-spinner fa-spin"></i></li>
      : 
      Object.keys(props.data.navbar_pages).map(page =>
      <li><a href={'/'+page}>{props.data.navbar_pages[page].name}</a></li>
      )
      }
      </ul>
      <ul className="nav navbar-nav navbar-right">
      {
      props.isFetching ?
      <li><i className="fa fa-spinner fa-spin"></i></li>
      :
      props.data.user ?
         <span>
         <li>
         <a href={"/players/"+props.data.user.account_id}>Profile</a>
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

function mapStateToProps(data)
{
   return data.reducers.metadata;
}
export default connect(mapStateToProps)(NavBar);