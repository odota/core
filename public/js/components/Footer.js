import React from 'react';
import
{
  connect
}
from 'react-redux';
const Footer = () => (
  <footer className="footer">
   <div className="container">
      <div className="row">
         <div className="col-md-4 text-center">
            <p>Buy some cheese. Help pay for servers.</p>
            <p>Reaching the goal every month keeps us running.</p>
         </div>
         <div className="col-md-4 text-center">
            <div className="meter_wrapper">
               <h3 style={{"fontWeight":700, "marginTop": 0}}>Monthly Cheese Goal</h3>
               <div className="meter">
                  <span style={{width: "2%", "minWidth":"7.1%"}}>2%</span>
               </div>
               <small>Behind 36.71%. Resets in 19 days.</small>
            </div>
         </div>
         <div className="col-md-4 text-center">
            <span style={{padding: "5px 11px"}} className="flaticon-1 medium-cheese" />
            <a href="/carry" target="_blank">
               <button style={{"marginBottom":"2em", "marginLeft": "2em"}} className="btn btn-warning">Help Us Out</button>
            </a>
         </div>
      </div>
      <div className="row">
         <div className="col-md-12 text-center">
            <small>
               An <a href="https://github.com/yasp-dota/yasp">open source</a> volunteer project
               &bull; <a href='/privacyterms'>Privacy & Terms</a>
               &bull; Follow on <a href='https://twitter.com/yasp_dota'><i className="fa fa-twitter"></i></a>
               &bull; Join us on <a href='https://discord.gg/0o5SQGbXuWALMIGQ' target="_blank">Discord</a>
               &bull; Dota 2 API powered by <a href='http://store.steampowered.com/'><i className="fa fa-steam-square"></i></a>
               &bull; Parsing by <a href='https://github.com/skadistats/clarity'>clarity</a>
               &bull; Wallpaper by <a href="http://css101.deviantart.com/">css101</a>
               &bull; Cheese icon by <a href="http://www.belcu.com">Belc</a> on <a href="http://www.flaticon.com">flaticon</a>
            </small>
         </div>
      </div>
   </div>
  </footer>
);

function mapStateToProps(input)
{
  return {
    input
  };
}
export default connect(mapStateToProps)(Footer);
//tooltips();
//formatHtml();