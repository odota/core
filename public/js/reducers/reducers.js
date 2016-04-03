import * as Actions from '../actions/actions.js';
var initialState = {
  match:
  {
    data:
    {}
  },
  player:
  {
    data:
    {}
  },
  user:
  {
    data:
    {}
  },
  navbar:
  {
    data:
    {}
  },
  cheese:
  {
    data:
    {}
  }
};
export default function reducers(state = initialState, action)
{
  switch (action.type)
  {
    case Actions.REQUEST_NAVBAR:
      return Object.assign(
      {}, state,
      {
        navbar:
        {
          isFetching: true,
          data:
          {}
        }
      });
    case Actions.RECEIVE_NAVBAR:
      return Object.assign(
      {}, state,
      {
        navbar:
        {
          isFetching: false,
          data: action.data
        }
      });
    case Actions.REQUEST_CHEESE:
      return Object.assign(
      {}, state,
      {
        cheese:
        {
          isFetching: true,
          data:
          {}
        }
      });
    case Actions.RECEIVE_CHEESE:
      return Object.assign(
      {}, state,
      {
        cheese:
        {
          isFetching: true,
          data: action.data
        }
      });
    case Actions.REQUEST_USER:
      return Object.assign(
      {}, state,
      {
        user:
        {
          isFetching: true,
          data:
          {}
        }
      });
    case Actions.RECEIVE_USER:
      return Object.assign(
      {}, state,
      {
        user:
        {
          isFetching: true,
          data: action.data
        }
      });
    default:
      //unrecognized action, return original state
      return state;
  }
}