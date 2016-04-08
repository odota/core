import React from 'react';
import { connect } from 'react-redux';

const Match = (data) => (
      <pre>{JSON.stringify(data, null, 2)}</pre>
);

function mapStateToProps(data) {
  return data.content;
}

export default connect(mapStateToProps)(Match);