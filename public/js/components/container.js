import React from 'react'
import { connect } from 'react-redux'

const Container = ({todos}) => (
    <div>
      <h1>Todos</h1>
      {todos.map(todo => <p key={todo}>{todo}</p>)}
    </div>
);

function mapStateToProps(todos) {
  return {
    todos
  }
}

export default connect(mapStateToProps)(Container)    
    
