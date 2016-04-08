import * as Actions from '../actions/actions.js';
var initialState = {
  content:
  {
    data:
    {}
  },
  metadata:
  {
    data:
    {
      navbar_pages:
      {},
      match_pages:
      {},
      player_pages:
      {},
      cheese: null,
      user: null,
      banner: null,
    }
  },
};
export default function reducers(state = initialState, action)
{
  switch (action.type)
  {
    case Actions.REQUEST_METADATA:
      return Object.assign(
      {}, state,
      {
        metadata:
        {
          isFetching: true,
          data:
          {}
        }
      });
    case Actions.RECEIVE_METADATA:
      return Object.assign(
      {}, state,
      {
        metadata:
        {
          isFetching: false,
          data: action.data
        }
      });
    case Actions.REQUEST_MATCH:
    case Actions.REQUEST_PLAYER:
      return Object.assign(
      {}, state,
      {
        content:
        {
          isFetching: true,
          data:
          {}
        }
      });
    case Actions.RECEIVE_MATCH:
    case Actions.RECEIVE_PLAYER:
      return Object.assign(
      {}, state,
      {
        content:
        {
          isFetching: false,
          data: action.data
        }
      });
    default:
      //unrecognized action, return original state
      return state;
  }
}