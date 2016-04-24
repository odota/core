import React from 'react';
import
{
  connect
}
from 'react-redux';
import * as Actions from '../actions/actions';
class Match extends React.Component
{
  constructor(props)
  {
    super(props);
  }
  componentDidMount()
  {
    this.props.dispatch(Actions.fetchData(Actions.MATCH,
    {
      match_id: this.props.params.match_id
    }));
  }
  render()
  {
    //sections
    return <pre>{JSON.stringify(this.props, null, 2)}</pre>;
  }
}

function mapStateToProps(data)
{
  return {
    data
  };
}
export default connect(mapStateToProps)(Match);