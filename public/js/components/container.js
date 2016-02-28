import React from 'react'
import { connect } from 'react-redux'
import Tabs from './tabs'

const Container = ({todos}) => (
    <div>
      <Header />
      <Tabs />
      <Content />
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
    
