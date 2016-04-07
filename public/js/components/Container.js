import React from 'react';
import { connect } from 'react-redux';

const Container = ({data}) => (
    <div>
      <h1>Title 
      <small>Subtext</small>
      </h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
);

function mapStateToProps(data) {
  return {
    data
  };
}

export default connect(mapStateToProps)(Container);  
    
