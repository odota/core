import React from 'react';
import { connect } from 'react-redux';
import TabBar from './TabBar';

const Container = ({todos}) => (
    <div>
      <TabBar />
      <h1>Title 
      <small>Subtext</small>
      </h1>
      {todos.map(todo => <p key={todo}>{todo}</p>)}
    </div>
);

function mapStateToProps(todos) {
  return {
    todos
  }
}

export default connect(mapStateToProps)(Container)    
    
