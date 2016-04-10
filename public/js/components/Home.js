import React from 'react';
import { connect } from 'react-redux';

const Home = (data) => (
      <div>This is a home page!</div>
);

function mapStateToProps(data) {
  return data.content;
}

export default connect(mapStateToProps)(Home);