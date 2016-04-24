import React from 'react';
import { connect } from 'react-redux';
import Match from './Match';
import Player from './Player';

const Container = (data) => (
    <div>
      <h2>{(data.personaname || data.match_id) + " "}
      <small>{ "asdf" }</small>
      </h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
);

function mapStateToProps(data) {
  return data.content;
}

export default connect(mapStateToProps)(Container);